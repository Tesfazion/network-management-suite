const express = require('express');
const path = require('path');
const config = require('./config');
const logger = require('./lib/logger');
const { securityHeaders } = require('./middleware/security');
const { errorHandler } = require('./middleware/errors');
const apiRouter = require('./routes');

const app = express();

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress
    };
    
    if (res.statusCode >= 500) {
      logger.error(`${req.method} ${req.path} ${res.statusCode}`, logData);
    } else if (res.statusCode >= 400) {
      logger.warn(`${req.method} ${req.path} ${res.statusCode}`, logData);
    } else {
      logger.info(`${req.method} ${req.path} ${res.statusCode}`, logData);
    }
  });
  
  next();
});

app.disable('x-powered-by');
app.use(securityHeaders);
app.use(express.json({ limit: config.bodyLimit }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', apiRouter);

app.use(errorHandler);

module.exports = app;