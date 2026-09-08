/**
 * Simple console logger with timestamps and severity levels
 */

const levels = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

function timestamp() {
  return new Date().toISOString();
}

function log(level, message, meta = {}) {
  const logEntry = {
    timestamp: timestamp(),
    level,
    message,
    ...meta
  };
  
  const output = `[${logEntry.timestamp}] ${level}: ${message}`;
  
  switch (level) {
    case levels.ERROR:
      console.error(output, meta);
      break;
    case levels.WARN:
      console.warn(output, meta);
      break;
    default:
      console.log(output, meta);
  }
}

module.exports = {
  error: (message, meta) => log(levels.ERROR, message, meta),
  warn: (message, meta) => log(levels.WARN, message, meta),
  info: (message, meta) => log(levels.INFO, message, meta),
  debug: (message, meta) => log(levels.DEBUG, message, meta),
  levels
};
