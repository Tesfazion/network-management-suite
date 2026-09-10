const config = require('../config');

/**
 * Optional CORS support for external API consumers.
 * No-op unless CORS_ORIGIN is configured.
 */
function cors(req, res, next) {
  if (!config.corsOrigin) return next();
  res.setHeader('Access-Control-Allow-Origin', config.corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

module.exports = { cors };