const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * Authentication middleware - verifies JWT token
 */
function authenticate(req, res, next) {
  try {
    // Check for token in Authorization header or cookies
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : req.cookies?.token;

    if (!token) {
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'NO_TOKEN' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, config.jwtSecret);
    
    // Attach user info to request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
      orgId: decoded.orgId,
      orgRole: decoded.orgRole
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED' 
      });
    }
    
    return res.status(401).json({ 
      error: 'Invalid token',
      code: 'INVALID_TOKEN' 
    });
  }
}

/**
 * Optional authentication - sets req.user if token exists but doesn't fail if missing
 */
function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : req.cookies?.token;

    if (token) {
      const decoded = jwt.verify(token, config.jwtSecret);
      req.user = {
        id: decoded.userId,
        email: decoded.email,
        name: decoded.name,
        role: decoded.role,
        orgId: decoded.orgId,
        orgRole: decoded.orgRole
      };
    }
  } catch (error) {
    // Ignore errors in optional auth
  }

  next();
}

/**
 * Require specific organization role
 */
function requireOrgRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.orgRole)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.user.orgRole
      });
    }

    next();
  };
}

/**
 * Require platform admin role
 */
function requirePlatformAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Platform admin access required' });
  }

  next();
}

/**
 * Ensure request has organization context
 */
function requireOrganization(req, res, next) {
  if (!req.user?.orgId) {
    return res.status(400).json({ 
      error: 'Organization context required',
      message: 'Please select an organization first'
    });
  }

  next();
}

module.exports = {
  authenticate,
  optionalAuth,
  requireOrgRole,
  requirePlatformAdmin,
  requireOrganization
};
