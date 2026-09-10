const express = require('express');
const db = require('../db');
const { authenticate, requireOrgRole } = require('../middleware/authenticate');
const logger = require('../lib/logger');

const router = express.Router();

/**
 * GET /api/organizations - Get user's organizations
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT o.id, o.name, o.slug, o.subscription_tier, o.subscription_status,
              o.max_devices, o.created_at, om.role as member_role, om.joined_at
       FROM organizations o
       JOIN organization_members om ON o.id = om.organization_id
       WHERE om.user_id = $1
       ORDER BY om.joined_at ASC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching organizations:', error);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

/**
 * GET /api/organizations/:id - Get organization details
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user is member
    const memberCheck = await db.query(
      `SELECT 1 FROM organization_members 
       WHERE organization_id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get organization details
    const result = await db.query(
      `SELECT o.*, om.role as member_role
       FROM organizations o
       JOIN organization_members om ON o.id = om.organization_id
       WHERE o.id = $1 AND om.user_id = $2`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Get member count
    const membersResult = await db.query(
      'SELECT COUNT(*) as count FROM organization_members WHERE organization_id = $1',
      [id]
    );

    // Get device count
    const devicesResult = await db.query(
      'SELECT COUNT(*) as count FROM devices WHERE org_id = $1',
      [id]
    );

    const org = result.rows[0];
    org.member_count = parseInt(membersResult.rows[0].count);
    org.device_count = parseInt(devicesResult.rows[0].count);

    res.json(org);
  } catch (error) {
    logger.error('Error fetching organization:', error);
    res.status(500).json({ error: 'Failed to fetch organization' });
  }
});

/**
 * PUT /api/organizations/:id - Update organization
 */
router.put('/:id', authenticate, requireOrgRole('owner', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Organization name is required' });
    }

    // Verify user has permission
    if (req.user.orgId !== id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await db.query(
      `UPDATE organizations 
       SET name = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [name.trim(), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    logger.info(`Organization updated: ${name} by user ${req.user.email}`);
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error updating organization:', error);
    res.status(500).json({ error: 'Failed to update organization' });
  }
});

/**
 * GET /api/organizations/:id/members - Get organization members
 */
router.get('/:id/members', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user is member
    const memberCheck = await db.query(
      `SELECT 1 FROM organization_members 
       WHERE organization_id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get all members
    const result = await db.query(
      `SELECT u.id, u.name, u.email, u.last_login,
              om.role, om.joined_at,
              iu.name as invited_by_name
       FROM organization_members om
       JOIN users u ON om.user_id = u.id
       LEFT JOIN users iu ON om.invited_by = iu.id
       WHERE om.organization_id = $1
       ORDER BY om.joined_at ASC`,
      [id]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Error fetching members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

/**
 * POST /api/organizations/:id/members - Invite member to organization
 */
router.post('/:id/members', authenticate, requireOrgRole('owner', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { email, role = 'member' } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Verify user has permission
    if (req.user.orgId !== id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate role
    const validRoles = ['owner', 'admin', 'member', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Find user by email
    const userResult = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'User not found',
        message: 'User must sign up first before being invited' 
      });
    }

    const userId = userResult.rows[0].id;

    // Check if already a member
    const existingMember = await db.query(
      'SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existingMember.rows.length > 0) {
      return res.status(400).json({ error: 'User is already a member' });
    }

    // Add member
    const result = await db.query(
      `INSERT INTO organization_members (organization_id, user_id, role, invited_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, userId, role, req.user.id]
    );

    logger.info(`User ${email} invited to organization by ${req.user.email}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Error inviting member:', error);
    res.status(500).json({ error: 'Failed to invite member' });
  }
});

/**
 * PUT /api/organizations/:orgId/members/:userId - Update member role
 */
router.put('/:orgId/members/:userId', authenticate, requireOrgRole('owner', 'admin'), async (req, res) => {
  try {
    const { orgId, userId } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ error: 'Role is required' });
    }

    // Verify user has permission
    if (req.user.orgId !== orgId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Validate role
    const validRoles = ['owner', 'admin', 'member', 'viewer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Cannot change own role
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    // Update role
    const result = await db.query(
      `UPDATE organization_members 
       SET role = $1
       WHERE organization_id = $2 AND user_id = $3
       RETURNING *`,
      [role, orgId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    logger.info(`Member role updated in org ${orgId} by ${req.user.email}`);
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Error updating member role:', error);
    res.status(500).json({ error: 'Failed to update member role' });
  }
});

/**
 * DELETE /api/organizations/:orgId/members/:userId - Remove member
 */
router.delete('/:orgId/members/:userId', authenticate, requireOrgRole('owner', 'admin'), async (req, res) => {
  try {
    const { orgId, userId } = req.params;

    // Verify user has permission
    if (req.user.orgId !== orgId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Cannot remove self
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot remove yourself' });
    }

    // Check if user is the only owner
    const ownersResult = await db.query(
      `SELECT COUNT(*) as count FROM organization_members 
       WHERE organization_id = $1 AND role = 'owner'`,
      [orgId]
    );

    const memberRoleResult = await db.query(
      'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [orgId, userId]
    );

    if (memberRoleResult.rows.length > 0 && 
        memberRoleResult.rows[0].role === 'owner' && 
        parseInt(ownersResult.rows[0].count) === 1) {
      return res.status(400).json({ 
        error: 'Cannot remove the only owner',
        message: 'Assign another owner first' 
      });
    }

    // Remove member
    const result = await db.query(
      `DELETE FROM organization_members 
       WHERE organization_id = $1 AND user_id = $2
       RETURNING *`,
      [orgId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    logger.info(`Member removed from org ${orgId} by ${req.user.email}`);
    res.json({ success: true, message: 'Member removed' });
  } catch (error) {
    logger.error('Error removing member:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

/**
 * GET /api/organizations/:id/stats - Get organization statistics
 */
router.get('/:id/stats', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user is member
    const memberCheck = await db.query(
      `SELECT 1 FROM organization_members 
       WHERE organization_id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get various stats
    const stats = {};

    // Device stats
    const devicesResult = await db.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN last_status = 'up' THEN 1 END) as online,
        COUNT(CASE WHEN last_status = 'down' THEN 1 END) as offline,
        COUNT(CASE WHEN monitored = true THEN 1 END) as monitored
       FROM devices WHERE org_id = $1`,
      [id]
    );
    stats.devices = devicesResult.rows[0];

    // VLAN stats
    const vlansResult = await db.query(
      'SELECT COUNT(*) as total FROM vlans WHERE org_id = $1',
      [id]
    );
    stats.vlans = { total: parseInt(vlansResult.rows[0].total) };

    // Issues stats
    const issuesResult = await db.query(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved
       FROM issues WHERE org_id = $1`,
      [id]
    );
    stats.issues = issuesResult.rows[0];

    // Members stats
    const membersResult = await db.query(
      'SELECT COUNT(*) as total FROM organization_members WHERE organization_id = $1',
      [id]
    );
    stats.members = { total: parseInt(membersResult.rows[0].total) };

    res.json(stats);
  } catch (error) {
    logger.error('Error fetching organization stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
