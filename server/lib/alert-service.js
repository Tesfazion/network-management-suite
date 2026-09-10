/**
 * Alert Service
 * Handles email and webhook notifications for monitoring events
 */

const nodemailer = require('nodemailer');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const logger = require('./logger');
const config = require('../config');

class AlertService {
  constructor() {
    this.emailTransporter = null;
    this.emailConfigured = false;
    this.webhookUrl = null;
    this.webhookConfigured = false;
    this.alertsEnabled = true;
    this.alertsSent = { email: 0, webhook: 0 };
    this.suppressedAlerts = new Map(); // For alert suppression
  }

  /**
   * Initialize alert service with configuration
   */
  async initialize() {
    // Setup email if configured
    if (config.smtp.host && config.smtp.user) {
      try {
        this.emailTransporter = nodemailer.createTransport({
          host: config.smtp.host,
          port: config.smtp.port || 587,
          secure: config.smtp.secure || false,
          auth: {
            user: config.smtp.user,
            pass: config.smtp.pass
          },
          tls: {
            rejectUnauthorized: false // Allow self-signed certificates
          }
        });

        // Verify email configuration
        await this.emailTransporter.verify();
        this.emailConfigured = true;
        logger.info(`Email alerts configured (${config.smtp.host}:${config.smtp.port})`);
      } catch (error) {
        logger.error('Failed to configure email alerts:', error.message);
        this.emailConfigured = false;
      }
    } else {
      logger.info('Email alerts not configured (set SMTP_* environment variables)');
    }

    // Setup webhook if configured
    if (config.webhook.url) {
      this.webhookUrl = config.webhook.url;
      this.webhookConfigured = true;
      logger.info(`Webhook alerts configured (${this.webhookUrl})`);
    } else {
      logger.info('Webhook alerts not configured (set WEBHOOK_URL environment variable)');
    }
  }

  /**
   * Send email alert
   * @param {object} alertData - Alert information
   */
  async sendEmailAlert(alertData) {
    if (!this.emailConfigured || !this.alertsEnabled) {
      logger.debug('Email alerts not sent: email not configured or alerts disabled');
      return;
    }

    // Check if alert is suppressed
    if (this.isAlertSuppressed(alertData.device_id, 'email')) {
      logger.debug(`Email alert suppressed for device ${alertData.device_name}`);
      return;
    }

    try {
      const subject = alertData.status === 'down'
        ? `🔴 CRITICAL: ${alertData.device_name} is DOWN`
        : `✅ RECOVERY: ${alertData.device_name} is back UP`;

      const htmlBody = this.buildEmailHtml(alertData);
      const textBody = this.buildEmailText(alertData);

      const info = await this.emailTransporter.sendMail({
        from: `"Network Monitoring" <${config.smtp.from || config.smtp.user}>`,
        to: config.smtp.alertEmail,
        subject: subject,
        text: textBody,
        html: htmlBody
      });

      this.alertsSent.email++;
      logger.info(`Email alert sent to ${config.smtp.alertEmail}: ${subject}`);

      // Suppress similar alerts for 5 minutes
      this.suppressAlert(alertData.device_id, 'email', 300000);

      return info;

    } catch (error) {
      logger.error('Failed to send email alert:', error);
      throw error;
    }
  }

  /**
   * Build HTML email content
   */
  buildEmailHtml(alertData) {
    const isDown = alertData.status === 'down';
    const statusColor = isDown ? '#dc3545' : '#28a745';
    const statusText = isDown ? 'DOWN' : 'UP';
    const icon = isDown ? '🔴' : '✅';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${statusColor}; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { background: #f8f9fa; padding: 20px; border: 1px solid #dee2e6; border-top: none; }
    .info-row { margin: 10px 0; }
    .label { font-weight: bold; color: #666; }
    .value { color: #000; }
    .footer { margin-top: 20px; padding: 10px; background: #e9ecef; border-radius: 5px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${icon} Device ${statusText}</h1>
    </div>
    <div class="content">
      <div class="info-row">
        <span class="label">Device Name:</span>
        <span class="value">${alertData.device_name}</span>
      </div>
      <div class="info-row">
        <span class="label">IP Address:</span>
        <span class="value">${alertData.device_ip}</span>
      </div>
      <div class="info-row">
        <span class="label">Device Type:</span>
        <span class="value">${alertData.device_type || 'N/A'}</span>
      </div>
      <div class="info-row">
        <span class="label">Status:</span>
        <span class="value" style="color: ${statusColor}; font-weight: bold;">${statusText}</span>
      </div>
      ${alertData.rtt_ms ? `
      <div class="info-row">
        <span class="label">Response Time:</span>
        <span class="value">${alertData.rtt_ms}ms</span>
      </div>
      ` : ''}
      <div class="info-row">
        <span class="label">Time:</span>
        <span class="value">${new Date(alertData.timestamp).toLocaleString()}</span>
      </div>
      <div class="info-row">
        <span class="label">Severity:</span>
        <span class="value">${alertData.severity.toUpperCase()}</span>
      </div>
    </div>
    <div class="footer">
      This is an automated alert from Network Management Suite monitoring system.
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Build plain text email content
   */
  buildEmailText(alertData) {
    const isDown = alertData.status === 'down';
    const statusText = isDown ? 'DOWN' : 'UP';

    return `
Device ${statusText} Alert

Device Name: ${alertData.device_name}
IP Address: ${alertData.device_ip}
Device Type: ${alertData.device_type || 'N/A'}
Status: ${statusText}
${alertData.rtt_ms ? `Response Time: ${alertData.rtt_ms}ms\n` : ''}Time: ${new Date(alertData.timestamp).toLocaleString()}
Severity: ${alertData.severity.toUpperCase()}

---
This is an automated alert from Network Management Suite monitoring system.
    `.trim();
  }

  /**
   * Send webhook alert (Slack, Discord, Teams, or custom)
   * @param {object} alertData - Alert information
   */
  async sendWebhookAlert(alertData) {
    if (!this.webhookConfigured || !this.alertsEnabled) {
      logger.debug('Webhook alerts not sent: webhook not configured or alerts disabled');
      return;
    }

    // Check if alert is suppressed
    if (this.isAlertSuppressed(alertData.device_id, 'webhook')) {
      logger.debug(`Webhook alert suppressed for device ${alertData.device_name}`);
      return;
    }

    try {
      const payload = this.buildWebhookPayload(alertData);
      
      await this.sendHttpPost(this.webhookUrl, payload);
      
      this.alertsSent.webhook++;
      logger.info(`Webhook alert sent for device ${alertData.device_name}`);

      // Suppress similar alerts for 5 minutes
      this.suppressAlert(alertData.device_id, 'webhook', 300000);

    } catch (error) {
      logger.error('Failed to send webhook alert:', error);
      throw error;
    }
  }

  /**
   * Build webhook payload (Slack/Discord compatible format)
   */
  buildWebhookPayload(alertData) {
    const isDown = alertData.status === 'down';
    const color = isDown ? '#dc3545' : '#28a745';
    const icon = isDown ? ':red_circle:' : ':white_check_mark:';
    const statusText = isDown ? 'DOWN' : 'UP';

    // Slack/Discord compatible format
    return {
      username: 'Network Monitoring',
      icon_emoji: ':satellite:',
      attachments: [{
        color: color,
        title: `${icon} Device ${statusText}: ${alertData.device_name}`,
        fields: [
          {
            title: 'Device Name',
            value: alertData.device_name,
            short: true
          },
          {
            title: 'IP Address',
            value: alertData.device_ip,
            short: true
          },
          {
            title: 'Device Type',
            value: alertData.device_type || 'N/A',
            short: true
          },
          {
            title: 'Status',
            value: statusText,
            short: true
          },
          ...(alertData.rtt_ms ? [{
            title: 'Response Time',
            value: `${alertData.rtt_ms}ms`,
            short: true
          }] : []),
          {
            title: 'Severity',
            value: alertData.severity.toUpperCase(),
            short: true
          },
          {
            title: 'Time',
            value: new Date(alertData.timestamp).toLocaleString(),
            short: false
          }
        ],
        footer: 'Network Management Suite',
        ts: Math.floor(new Date(alertData.timestamp).getTime() / 1000)
      }]
    };
  }

  /**
   * Send HTTP POST request
   */
  sendHttpPost(url, data) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;
      const postData = JSON.stringify(data);

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = protocol.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, body });
          } else {
            reject(new Error(`Webhook returned status ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  /**
   * Check if alert should be suppressed (prevent spam)
   */
  isAlertSuppressed(deviceId, alertType) {
    const key = `${deviceId}_${alertType}`;
    const suppressedUntil = this.suppressedAlerts.get(key);
    
    if (suppressedUntil && Date.now() < suppressedUntil) {
      return true;
    }

    return false;
  }

  /**
   * Suppress alerts for a device for specified duration
   */
  suppressAlert(deviceId, alertType, durationMs) {
    const key = `${deviceId}_${alertType}`;
    this.suppressedAlerts.set(key, Date.now() + durationMs);

    // Clean up expired suppressions periodically
    setTimeout(() => {
      this.suppressedAlerts.delete(key);
    }, durationMs);
  }

  /**
   * Enable or disable all alerts
   */
  setAlertsEnabled(enabled) {
    this.alertsEnabled = enabled;
    logger.info(`Alerts ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get alert service status
   */
  getStatus() {
    return {
      emailConfigured: this.emailConfigured,
      webhookConfigured: this.webhookConfigured,
      alertsEnabled: this.alertsEnabled,
      alertsSent: this.alertsSent,
      suppressedAlertsCount: this.suppressedAlerts.size
    };
  }
}

// Singleton instance
const alertService = new AlertService();

module.exports = alertService;
