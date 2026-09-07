/**
 * Network Management Suite — process entry point.
 * Loads the Express app and listens on the configured port with
 * graceful shutdown on Ctrl+C / SIGTERM.
 */
const app = require('./app');
const config = require('./config');
const db = require('./db');

if (require.main === module) {
  const server = app.listen(config.port, config.host, () => {
    const url = config.port === 80 ? 'http://localhost' : `http://localhost:${config.port}`;
    console.log(`Network Management Suite running at ${url}`);
    if (config.lanIp) console.log(`  LAN access: http://${config.lanIp}:${config.port}`);
  });

  function shutdown(signal) {
    console.log(`  ${signal} received, shutting down...`);
    server.close(() => {
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.close();
      } catch { /* already closing */ }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = app;