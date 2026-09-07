const express = require('express');
const path = require('path');
const config = require('./config');
const { securityHeaders } = require('./middleware/security');
const { errorHandler } = require('./middleware/errors');
const apiRouter = require('./routes');

const app = express();

app.disable('x-powered-by');
app.use(securityHeaders);
app.use(express.json({ limit: config.bodyLimit }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', apiRouter);

app.use(errorHandler);

module.exports = app;