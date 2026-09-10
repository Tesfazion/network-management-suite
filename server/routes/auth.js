const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const config = require('../config');
const { authenticate } = require('../middleware/authenticate');
const logger = require('../lib/logger');

const router = express.Router();

/**
 * POST /api/auth/signup - Register new user and organization
 */
router.post('/signup', async (req, res) => {
  const { email, password, name, organizationName } = req.body;

  try {
    // Validation
    if (!email || !password || !name || !organizationName) {
      return res.status(400).json({ 
        error: 'All fields are required',
        fields: { email, password: !!password, name, organizationName }
      });
    }

    if (password.length < 8) {
      return res.status(400).json({ 
        error: 'Password must be at least 8 characters long' 
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if user already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Generate organization slug
    const baseSlug = organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    let slug = baseSlug;
    let counter = 1;
    
    // Ensure unique slug
    while (true) {
      const existing = await db.query(
        'SELECT id FROM organizations WHERE slug = $1',
        [slug]
      );
      if (existing.rows.length === 0) break;
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Start transaction
    await db.query('BEGIN');

    try {
      // Create organization
      const orgResult = await db.query(
        `INSERT INTO organizations (name, slug, subscription_tier, max_devices)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, slug, subscription_tier, max_devices, created_at`,
        [organizationName, slug, 'free', 10]
      );
      const organization = orgResult.rows[0];

      // Create user
      const userResult = await db.query(
        `INSERT INTO users (email, password_hash, name, email_verified)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, name, role, created_at`,
        [email.toLowerCase(), passwordHash, name, false]
      );
      const user = userResult.rows[0];

      // Add user to organization as owner
      await db.query(
        `INSERT INTO organization_members (organization_id, user_id, role)
         VALUES ($1, $2, $3)`,
        [organization.id, user.id, 'owner']
      );

      await db.query('COMMIT');

      // Generate JWT token
      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          orgId: organization.id,
          orgRole: 'owner'
        },
        config.jwtSecret,
        { expiresIn: '7d' }
      );

      logger.info(`New user registered: ${email} with org: ${organizationName}`);

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        },
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          role: 'owner',
          subscription_tier: organization.subscription_tier
        }
      });
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    logger.error('Signup error:', error);
    res.status(500).json({ 
      error: 'Failed to create account',
      message: error.message 
    });
  }
});

/**
 * POST /api/auth/login - User login
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const result = await db.query(
      `SELECT id, email, password_hash, name, role 
       FROM users 
       WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Get user's organizations
    const orgsResult = await db.query(
      `SELECT o.id, o.name, o.slug, o.subscription_tier, o.max_devices, 
              om.role as member_role
       FROM organizations o
       JOIN organization_members om ON o.id = om.organization_id
       WHERE om.user_id = $1
       ORDER BY om.joined_at ASC`,
      [user.id]
    );

    if (orgsResult.rows.length === 0) {
      return res.status(400).json({ 
        error: 'No organization found',
        message: 'Please contact support' 
      });
    }

    // Use first organization as default
    const defaultOrg = orgsResult.rows[0];

    // Update last login
    await db.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        orgId: defaultOrg.id,
        orgRole: defaultOrg.member_role
      },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    logger.info(`User logged in: ${email}`);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      organization: {
        id: defaultOrg.id,
        name: defaultOrg.name,
        slug: defaultOrg.slug,
        role: defaultOrg.member_role,
        subscription_tier: defaultOrg.subscription_tier
      },
      organizations: orgsResult.rows
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ 
      error: 'Login failed',
      message: error.message 
    });
  }
});

/**
 * POST /api/auth/logout - User logout
 */
router.post('/logout', authenticate, (req, res) => {
  // With JWT, logout is handled client-side by removing the token
  logger.info(`User logged out: ${req.user.email}`);
  res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * GET /api/auth/me - Get current user info
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const userResult = await db.query(
      `SELECT id, email, name, role, email_verified, last_login, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Get current organization
    const orgResult = await db.query(
      `SELECT o.id, o.name, o.slug, o.subscription_tier, o.max_devices,
              om.role as member_role
       FROM organizations o
       JOIN organization_members om ON o.id = om.organization_id
       WHERE om.user_id = $1 AND o.id = $2`,
      [req.user.id, req.user.orgId]
    );

    res.json({
      user,
      organization: orgResult.rows[0] || null
    });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

/**
 * POST /api/auth/switch-org - Switch active organization
 */
router.post('/switch-org', authenticate, async (req, res) => {
  const { organizationId } = req.body;

  try {
    // Verify user is member of this organization
    const result = await db.query(
      `SELECT o.id, o.name, o.slug, o.subscription_tier, om.role as member_role
       FROM organizations o
       JOIN organization_members om ON o.id = om.organization_id
       WHERE om.user_id = $1 AND o.id = $2`,
      [req.user.id, organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this organization' });
    }

    const org = result.rows[0];

    // Generate new token with updated org
    const token = jwt.sign(
      {
        userId: req.user.id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
        orgId: org.id,
        orgRole: org.member_role
      },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      organization: org
    });
  } catch (error) {
    logger.error('Switch org error:', error);
    res.status(500).json({ error: 'Failed to switch organization' });
  }
});

module.exports = router;
