const config = require('../config');
const { DEFAULT_ORG_ID } = require('./default-org');

/**
 * Optional bearer-token protection for the API.
 * Enable by setting AUTH_TOKEN in the environment. When unset,
 * this middleware is a no-op so local/office installs stay frictionless while still supporting the
 * documented `AUTH_TOKEN` security mode.
 */
function requireAuth(req, res, next) {
  if (!config.authToken) {
    req.user = { id: 'anonymous', email: 'anonymous@local', name: 'Anonymous', role: 'user', orgId: DEFAULT_ORG_ID, orgRole: 'member' };
    return next();
  }
  const header = req.headers.authorization || '';
  if (header === `Bearer ${config.authToken}`) {
    req.user = { id: 'token-user', email: 'token@local', name: 'Token User', role: 'admin', orgId: DEFAULT_ORG_ID, orgRole: 'owner' };
    return next();
  }
  res.setHeader('WWW-Authenticate', 'Bearer');
  res.status(401).json({ error: 'unauthorized' });
}

module.exports = { requireAuth };
