const path = require('path');
const fs = require('fs');
const config = require('../config');
const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const logDir = path.join(__dirname, '..', '..', 'logs');
fs.mkdirSync(logDir, { recursive: true });

const isJson = config.logFormat === 'json';

const logger = createLogger({
  level: 'info',
  format: isJson
    ? format.combine(format.timestamp(), format.errors({ stack: true }), format.json())
    : format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} ${level.toUpperCase()}: ${message}${metaStr}`;
        })
      ),
  transports: [
    new transports.Console({
      format: isJson
        ? format.combine(format.timestamp(), format.errors({ stack: true }), format.json())
        : format.combine(
            format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            format.printf(({ timestamp, level, message, ...meta }) => {
              const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
              return `${timestamp} ${level.toUpperCase()}: ${message}${metaStr}`;
            })
          ),
    }),
    new DailyRotateFile({
      filename: path.join(logDir, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
    }),
  ],
});

module.exports = {
  info: (message, meta) => logger.info(message, meta),
  warn: (message, meta) => logger.warn(message, meta),
  error: (message, meta) => logger.error(message, meta),
  debug: (message, meta) => logger.debug(message, meta),
};
