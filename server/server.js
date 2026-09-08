/**
 * Network Management Suite — process entry point.
 * Loads the Express app and listens on the configured port with
 * graceful shutdown on Ctrl+C / SIGTERM.
 */
const app = require('./app');
const config = require('./config');
const db = require('./db');
const logger = require('./lib/logger');

if (require.main === module) {
  const server = app.listen(config.port, config.host, () => {
    const url = config.port === 80 ? 'http://localhost' : `http://localhost:${config.port}`;
    logger.info(`Network Management Suite v2.0.0 started successfully`);
    logger.info(`Server running at ${url}`);
    if (config.lanIp) logger.info(`LAN access: http://${config.lanIp}:${config.port}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Database: ${config.dbPath}`);
    logger.info(`Node.js: ${process.version}`);
  });

  // Handle server errors
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
    server.close(() => {
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
        logger.info('Database closed successfully');
      } catch (err) {
        logger.warn('Error closing database (may already be closed)', { error: err.message });
      }
      logger.info('Server shutdown complete');
      process.exit(0);
    });
    
    // Force exit after 5 seconds if graceful shutdown hangs
    setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 5000).unref();
  }

  // Handle unhandled rejections and exceptions
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection', { reason, promise });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = app;