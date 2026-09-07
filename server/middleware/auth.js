const config = require('../config');

/**
 * Optional bearer-token protection for the API.
 * Enable by setting AUTH_TOKEN in the environment. When unset,
 * this middleware is a no-op so local/office installs stay frictionless.
 */
function requireAuth(req, res, next) {
  if (!config.authToken) return next();
  const header = req.headers.authorization || '';
  if (header === `Bearer ${config.authToken}`) return next();
  res.setHeader('WWW-Authenticate', 'Bearer');
  res.status(401).json({ error: 'unauthorized' });
}

module.exports = { requireAuth };