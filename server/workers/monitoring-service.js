/**
 * Background Monitoring Service
 * Continuously monitors devices 24/7 and triggers alerts on state changes
 */

const { ping } = require('../lib/monitor');
const db = require('../db');
const logger = require('../lib/logger');

class MonitoringService {
  constructor() {
    this.interval = null;
    this.isRunning = false;
    this.checkIntervalMs = 60000; // Check every 60 seconds
    this.consecutiveFailsRequired = 3; // Require 3 fails before declaring DOWN
    this.deviceFailCounts = new Map(); // Track consecutive failures
    this.lastCheckTime = null;
  }

  /**
   * Start the monitoring service
   */
  start() {
    if (this.isRunning) {
      logger.warn('Monitoring service already running');
      return;
    }

    logger.info('Starting background monitoring service...');
    this.isRunning = true;
    
    // Run first check immediately
    this.runMonitoringCycle().catch(err => {
      logger.error('Initial monitoring cycle failed:', err);
    });

    // Then schedule periodic checks
    this.interval = setInterval(() => {
      this.runMonitoringCycle().catch(err => {
        logger.error('Monitoring cycle error:', err);
      });
    }, this.checkIntervalMs);

    logger.info(`Monitoring service started (interval: ${this.checkIntervalMs / 1000}s)`);
  }

  /**
   * Stop the monitoring service
   */
  stop() {
    if (!this.isRunning) return;

    logger.info('Stopping background monitoring service...');
    
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.isRunning = false;
    this.deviceFailCounts.clear();
    logger.info('Monitoring service stopped');
  }

  /**
   * Run a complete monitoring cycle for all devices
   */
  async runMonitoringCycle() {
    const startTime = Date.now();
    this.lastCheckTime = new Date();

    try {
      const devices = await this.getMonitoredDevices();
      
      if (devices.length === 0) {
        logger.debug('No monitored devices found');
        return;
      }

      logger.info(`Checking ${devices.length} monitored devices...`);

      // Check all devices in parallel (but with a limit to avoid overwhelming the system)
      const results = await this.checkDevicesBatch(devices);

      const duration = Date.now() - startTime;
      const upCount = results.filter(r => r.status === 'up').length;
      const downCount = results.filter(r => r.status === 'down').length;

      logger.info(`Monitoring cycle complete: ${upCount} up, ${downCount} down (${duration}ms)`);

      // Broadcast monitoring summary to connected clients
      if (global.wss) {
        global.wss.broadcast({
          type: 'monitoring_cycle_complete',
          timestamp: new Date().toISOString(),
          summary: { total: devices.length, up: upCount, down: downCount, duration }
        });
      }

    } catch (error) {
      logger.error('Monitoring cycle failed:', error);
      throw error;
    }
  }

  /**
   * Get all devices that have monitoring enabled
   */
  async getMonitoredDevices() {
    const result = await db.query(
      'SELECT id, name, ip, device_type, last_status FROM devices WHERE monitored = true ORDER BY id'
    );
    return result.rows;
  }

  /**
   * Check devices in batches to avoid overwhelming the system
   */
  async checkDevicesBatch(devices, batchSize = 10) {
    const results = [];

    for (let i = 0; i < devices.length; i += batchSize) {
      const batch = devices.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(device => this.checkDevice(device))
      );
      results.push(...batchResults);

      // Small delay between batches to avoid network flooding
      if (i + batchSize < devices.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Check a single device and handle state changes
   */
  async checkDevice(device) {
    const checkTime = new Date();

    try {
      // Ping the device
      const result = await ping(device.ip, 5000);
      const newStatus = result.alive ? 'up' : 'down';
      const rttMs = result.rttMs;

      // Get previous status
      const previousStatus = device.last_status;

      // Track consecutive failures for flapping detection
      const failCount = this.deviceFailCounts.get(device.id) || 0;

      if (!result.alive) {
        // Device is down, increment fail counter
        this.deviceFailCounts.set(device.id, failCount + 1);
      } else {
        // Device is up, reset fail counter
        this.deviceFailCounts.set(device.id, 0);
      }

      // Determine if we should declare device as DOWN
      const shouldDeclareDown = !result.alive && (failCount + 1) >= this.consecutiveFailsRequired;
      const shouldDeclareUp = result.alive;

      // Save check result to monitoring_history
      await this.saveCheckResult(device.id, newStatus, rttMs, checkTime);

      // Detect state changes and trigger alerts
      if (previousStatus === 'up' && shouldDeclareDown) {
        await this.handleDeviceDown(device, rttMs, checkTime);
      } else if (previousStatus === 'down' && shouldDeclareUp) {
        await this.handleDeviceUp(device, rttMs, checkTime);
      } else if (previousStatus !== newStatus && shouldDeclareDown) {
        // First time checking this device, and it's down
        await this.handleDeviceDown(device, rttMs, checkTime);
      }

      // Update device last_status in database (only if state confirmed)
      if ((previousStatus === 'up' && shouldDeclareDown) || 
          (previousStatus === 'down' && shouldDeclareUp) ||
          (previousStatus === null && (shouldDeclareDown || shouldDeclareUp))) {
        await db.query(
          'UPDATE devices SET last_status = $1, last_checked = $2, last_rtt = $3 WHERE id = $4',
          [newStatus, checkTime, rttMs, device.id]
        );
      }

      return { deviceId: device.id, status: newStatus, rttMs, previousStatus };

    } catch (error) {
      logger.error(`Error checking device ${device.name} (${device.ip}):`, error);
      return { deviceId: device.id, status: 'error', error: error.message };
    }
  }

  /**
   * Save check result to monitoring history
   */
  async saveCheckResult(deviceId, status, rttMs, checkedAt) {
    await db.query(
      'INSERT INTO monitoring_history (device_id, status, rtt_ms, checked_at) VALUES ($1, $2, $3, $4)',
      [deviceId, status, rttMs, checkedAt]
    );
  }

  /**
   * Handle device going DOWN - send alerts and create incident
   */
  async handleDeviceDown(device, rttMs, timestamp) {
    logger.warn(`ALERT: Device ${device.name} (${device.ip}) is DOWN`);

    const alertData = {
      device_id: device.id,
      device_name: device.name,
      device_ip: device.ip,
      device_type: device.device_type,
      status: 'down',
      timestamp: timestamp.toISOString(),
      severity: 'critical'
    };

    // Broadcast to WebSocket clients
    if (global.wss) {
      global.wss.broadcast({
        type: 'device_down',
        data: alertData
      });
    }

    // Send email alert (if configured)
    if (global.alertService) {
      await global.alertService.sendEmailAlert(alertData).catch(err => {
        logger.error('Failed to send email alert:', err);
      });
    }

    // Send webhook alert (if configured)
    if (global.alertService) {
      await global.alertService.sendWebhookAlert(alertData).catch(err => {
        logger.error('Failed to send webhook alert:', err);
      });
    }

    // Auto-create incident ticket
    await this.createIncidentForDevice(device, 'down', timestamp);

    // Log the alert
    await this.logAlert(device.id, 'device_down', alertData);
  }

  /**
   * Handle device coming back UP - send recovery notification
   */
  async handleDeviceUp(device, rttMs, timestamp) {
    logger.info(`RECOVERY: Device ${device.name} (${device.ip}) is back UP (RTT: ${rttMs}ms)`);

    const alertData = {
      device_id: device.id,
      device_name: device.name,
      device_ip: device.ip,
      device_type: device.device_type,
      status: 'up',
      rtt_ms: rttMs,
      timestamp: timestamp.toISOString(),
      severity: 'info'
    };

    // Broadcast to WebSocket clients
    if (global.wss) {
      global.wss.broadcast({
        type: 'device_up',
        data: alertData
      });
    }

    // Send recovery email (if configured)
    if (global.alertService) {
      await global.alertService.sendEmailAlert(alertData).catch(err => {
        logger.error('Failed to send recovery email:', err);
      });
    }

    // Send recovery webhook
    if (global.alertService) {
      await global.alertService.sendWebhookAlert(alertData).catch(err => {
        logger.error('Failed to send recovery webhook:', err);
      });
    }

    // Auto-close related incident
    await this.closeIncidentForDevice(device, timestamp);

    // Log the recovery
    await this.logAlert(device.id, 'device_up', alertData);
  }

  /**
   * Create incident ticket automatically when device goes down
   */
  async createIncidentForDevice(device, status, timestamp) {
    try {
      // Check if there's already an open incident for this device
      const existing = await db.query(
        `SELECT id FROM issues 
         WHERE device_id = $1 AND status IN ('Open', 'In Progress') 
         ORDER BY created_at DESC LIMIT 1`,
        [device.id]
      );

      if (existing.rows.length > 0) {
        logger.debug(`Incident already exists for device ${device.name}`);
        return;
      }

      // Create new incident
      const result = await db.query(
        `INSERT INTO issues (title, description, severity, status, device_id, reporter, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          `${device.name} is offline`,
          `Device ${device.name} (${device.ip}) stopped responding at ${timestamp.toLocaleString()}. Automatic monitoring detected the failure.`,
          'High',
          'Open',
          device.id,
          'Monitoring System',
          timestamp
        ]
      );

      logger.info(`Auto-created incident #${result.rows[0].id} for device ${device.name}`);

      // Broadcast incident creation
      if (global.wss) {
        global.wss.broadcast({
          type: 'incident_created',
          data: {
            incident_id: result.rows[0].id,
            device_name: device.name,
            severity: 'High'
          }
        });
      }

    } catch (error) {
      logger.error('Failed to create incident:', error);
    }
  }

  /**
   * Auto-close incident when device comes back up
   */
  async closeIncidentForDevice(device, timestamp) {
    try {
      const result = await db.query(
        `UPDATE issues 
         SET status = 'Resolved', 
             resolved_at = $1,
             description = description || E'\n\nAuto-resolved: Device came back online at ' || $2
         WHERE device_id = $3 AND status IN ('Open', 'In Progress')
         RETURNING id`,
        [timestamp, timestamp.toLocaleString(), device.id]
      );

      if (result.rows.length > 0) {
        logger.info(`Auto-closed incident #${result.rows[0].id} for device ${device.name}`);

        // Broadcast incident closure
        if (global.wss) {
          global.wss.broadcast({
            type: 'incident_resolved',
            data: {
              incident_id: result.rows[0].id,
              device_name: device.name
            }
          });
        }
      }

    } catch (error) {
      logger.error('Failed to close incident:', error);
    }
  }

  /**
   * Log alert to database for audit trail
   */
  async logAlert(deviceId, alertType, alertData) {
    try {
      await db.query(
        `INSERT INTO alert_log (device_id, alert_type, alert_data, created_at)
         VALUES ($1, $2, $3, $4)`,
        [deviceId, alertType, JSON.stringify(alertData), new Date()]
      );
    } catch (error) {
      // Don't fail the whole process if logging fails
      logger.error('Failed to log alert:', error);
    }
  }

  /**
   * Get monitoring service status
   */
  getStatus() {
    return {
      running: this.isRunning,
      checkInterval: this.checkIntervalMs,
      lastCheck: this.lastCheckTime,
      consecutiveFailsRequired: this.consecutiveFailsRequired
    };
  }

  /**
   * Update monitoring interval
   */
  setCheckInterval(intervalMs) {
    if (intervalMs < 10000) {
      throw new Error('Check interval must be at least 10 seconds');
    }

    this.checkIntervalMs = intervalMs;

    if (this.isRunning) {
      this.stop();
      this.start();
      logger.info(`Monitoring interval updated to ${intervalMs / 1000}s`);
    }
  }
}

// Singleton instance
const monitoringService = new MonitoringService();

module.exports = monitoringService;
