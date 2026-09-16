const express = require('express');
const db = require('../db').pool;
const config = require('../config');
const { setDefaultOrg } = require('../middleware/default-org');

const router = express.Router();

// Use default org for unauthenticated access
router.use(setDefaultOrg);

const EMPTY = { devices: [], cables: [], outlets: [], rooms: [], issues: [], vlans: [] };

async function buildSearch(q, orgId) {
  const like = `%${q}%`;

  const [devices, cables, outlets, rooms, vlans, issues] = await Promise.all([
    db.query(`
      SELECT d.id, d.name, d.ip, d.device_type, d.location, v.name AS vlan_name
      FROM devices d LEFT JOIN vlans v ON v.id = d.vlan_id
      WHERE d.org_id = $1 AND (d.name ILIKE $2 OR d.ip ILIKE $3 OR d.mac ILIKE $4 OR d.location ILIKE $5)
      ORDER BY d.name LIMIT 25`, [orgId, like, like, like, like]),

    db.query(`
      SELECT c.id, c.cable_id, c.test_result, c.status, o.label AS outlet_label
      FROM cables c LEFT JOIN outlets o ON o.id = c.outlet_id
      WHERE c.org_id = $1 AND (c.cable_id ILIKE $2 OR c.notes ILIKE $3)
      ORDER BY c.cable_id LIMIT 25`, [orgId, like, like]),

    db.query(`
      SELECT o.id, o.label, o.location, r.name AS room_name
      FROM outlets o JOIN rooms r ON r.id = o.room_id
      WHERE o.org_id = $1 AND (o.label ILIKE $2 OR o.location ILIKE $3)
      ORDER BY o.label LIMIT 25`, [orgId, like, like]),

    db.query(
      'SELECT id, name, floor, purpose FROM rooms WHERE org_id=$1 AND (name ILIKE $2 OR purpose ILIKE $3) LIMIT 25',
      [orgId, like, like]),

    db.query(
      'SELECT id, vlan_id, name, subnet FROM vlans WHERE org_id=$1 AND (name ILIKE $2 OR subnet ILIKE $3) LIMIT 25',
      [orgId, like, like]),

    db.query(`
      SELECT i.id, i.title, i.status, i.severity
      FROM issues i WHERE i.org_id=$1 AND (i.title ILIKE $2 OR i.description ILIKE $3)
      ORDER BY i.created_at DESC LIMIT 25`, [orgId, like, like]),
  ]);

  return {
    devices: devices.rows,
    cables: cables.rows,
    outlets: outlets.rows,
    rooms: rooms.rows,
    vlans: vlans.rows,
    issues: issues.rows,
  };
}

router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, config.maxSearchQuery);
  if (!q) return res.json(EMPTY);
  const orgId = req.user.orgId;
  const results = await buildSearch(q, orgId);
  res.json(results);
});

module.exports = router;
