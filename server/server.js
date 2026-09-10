/**
 * Network Management Suite — process entry point.
 * Loads the Express app and listens on the configured port with
 * graceful shutdown on Ctrl+C / SIGTERM.
 */
const app = require('./app');
const config = require('./config');
const db = require('./db');
const logger = require('./lib/logger');
const websocketServer = require('./lib/websocket');
const alertService = require('./lib/alert-service');
const monitoringService = require('./workers/monitoring-service');

if (require.main === module) {
  db.init().then(async () => {
    const server = app.listen(config.port, config.host, async () => {
      const url = config.port === 80 ? 'http://localhost' : `http://localhost:${config.port}`;
      logger.info(`Network Management Suite v2.0.0 started successfully`);
      logger.info(`Server running at ${url}`);
      if (config.lanIp) logger.info(`LAN access: http://${config.lanIp}:${config.port}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Database: ${config.databaseUrl || config.dbPath}`);
      logger.info(`Node.js: ${process.version}`);

      // Initialize WebSocket server
      websocketServer.initialize(server);
      global.wss = websocketServer; // Make available globally
      logger.info(`WebSocket server ready for real-time monitoring`);

      // Initialize alert service
      await alertService.initialize();
      global.alertService = alertService; // Make available globally

      // Start background monitoring service
      if (config.monitoring.enabled) {
        monitoringService.setCheckInterval(config.monitoring.checkInterval);
        monitoringService.consecutiveFailsRequired = config.monitoring.consecutiveFailsRequired;
        monitoringService.start();
        logger.info(`✓ Enterprise monitoring system ACTIVATED`);
        logger.info(`  - Auto-monitoring: every ${config.monitoring.checkInterval / 1000}s`);
        logger.info(`  - Email alerts: ${alertService.emailConfigured ? 'ENABLED' : 'DISABLED'}`);
        logger.info(`  - Webhook alerts: ${alertService.webhookConfigured ? 'ENABLED' : 'DISABLED'}`);
        logger.info(`  - Real-time updates: ENABLED (WebSocket)`);
      } else {
        logger.warn('Background monitoring is disabled (set MONITORING_ENABLED=true to enable)');
      }
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${config.port} is already in use. Try a different port with: PORT=<port> npm start`);
      } else {
        logger.error('Server error occurred', { error: err.message });
      }
      process.exit(1);
    });

    function shutdown(signal) {
      logger.info(`${signal} received, initiating graceful shutdown...`);
      
      // Stop monitoring service
      if (monitoringService.isRunning) {
        monitoringService.stop();
      }

      // Close WebSocket connections
      websocketServer.shutdown();

      server.close(async () => {
        try {
          await db.close();
          logger.info('Database closed successfully');
        } catch (err) {
          logger.warn('Error closing database (may already be closed)', { error: err.message });
        }
        logger.info('Server shutdown complete');
        process.exit(0);
      });

      setTimeout(() => {
        logger.error('Graceful shutdown timed out, forcing exit');
        process.exit(1);
      }, 5000).unref();
    }

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Promise Rejection', { reason, promise });
    });

    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
      process.exit(1);
    });

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }).catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
}

module.exports = app;
