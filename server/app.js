const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const config = require('./config');
const logger = require('./lib/logger');
const { securityHeaders } = require('./middleware/security');
const { cors } = require('./middleware/cors');
const { rateLimit } = require('./middleware/rateLimit');
const { requestId } = require('./middleware/requestId');
const { errorHandler } = require('./middleware/errors');
const apiRouter = require('./routes');
const authRouter = require('./routes/auth');

const app = express();

app.use(requestId);

app.use((req, res, next) => {
  const start = Date.now();
  const rid = req.id;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      requestId: rid,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
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
app.use(cors);
app.use(cookieParser());
app.use(express.json({ limit: config.bodyLimit }));

// Never let a browser or any intermediary cache the SPA document;
// stale copies of index.html keep showing an outdated dashboard.
app.use((req, res, next) => {
  if (req.method === 'GET' && (req.path === '/' || /\.html$/i.test(req.path))) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  // Force reload CSS and JS files by setting short cache and ETag
  if (req.method === 'GET' && (/\.css$/i.test(req.path) || /\.js$/i.test(req.path))) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// Authentication routes (no rate limit on auth for better UX)
app.use('/api/auth', authRouter);

app.use('/api/v1', rateLimit);
app.use('/api/v1', apiRouter);

app.use('/api', rateLimit);
app.use('/api', apiRouter);

app.use(errorHandler);

module.exports = app;
