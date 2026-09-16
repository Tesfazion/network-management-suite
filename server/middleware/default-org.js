/**
 * Middleware to set default organization when not authenticated
 * Uses the default organization (00000000-0000-0000-0000-000000000001)
 */

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';

function setDefaultOrg(req, res, next) {
  // If user is already authenticated, use their org
  if (req.user && req.user.orgId) {
    return next();
  }

  // Otherwise, set default organization
  req.user = {
    id: 'default-user',
    email: 'default@system.local',
    name: 'System User',
    role: 'admin',
    orgId: DEFAULT_ORG_ID,
    orgRole: 'owner'
  };

  next();
}

module.exports = { setDefaultOrg, DEFAULT_ORG_ID };
