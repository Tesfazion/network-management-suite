const express = require('express');
const db = require('../db');
const config = require('../config');

const router = express.Router();

const EMPTY = { devices: [], cables: [], outlets: [], rooms: [], issues: [], vlans: [] };

/**
 * Run a LIKE query with the given number of parameter placeholders.
 */
function searchAll(sql, paramCount, like) {
  const stmt = db.prepare(sql);
  const params = Array.from({ length: paramCount }, () => like);
  return stmt.all(...params);
}

function buildSearch(q) {
  const like = `%${q}%`;
  return {
    devices: searchAll(`
      SELECT d.id, d.name, d.ip, d.device_type, d.location, v.name AS vlan_name
      FROM devices d LEFT JOIN vlans v ON v.id = d.vlan_id
      WHERE d.name LIKE ? OR d.ip LIKE ? OR d.mac LIKE ? OR d.location LIKE ?
      ORDER BY d.name LIMIT 25`, 4, like),
    cables: searchAll(`
      SELECT c.id, c.cable_id, c.test_result, c.status, o.label AS outlet_label
      FROM cables c LEFT JOIN outlets o ON o.id = c.outlet_id
      WHERE c.cable_id LIKE ? OR c.notes LIKE ?
      ORDER BY c.cable_id LIMIT 25`, 2, like),
    outlets: searchAll(`
      SELECT o.id, o.label, o.location, r.name AS room_name
      FROM outlets o JOIN rooms r ON r.id = o.room_id
      WHERE o.label LIKE ? OR o.location LIKE ?
      ORDER BY o.label LIMIT 25`, 2, like),
    rooms: searchAll(
      'SELECT id, name, floor, purpose FROM rooms WHERE name LIKE ? OR purpose LIKE ? LIMIT 25', 2, like),
    vlans: searchAll(
      'SELECT id, vlan_id, name, subnet FROM vlans WHERE name LIKE ? OR subnet LIKE ? LIMIT 25', 2, like),
    issues: searchAll(`
      SELECT i.id, i.title, i.status, i.severity
      FROM issues i WHERE i.title LIKE ? OR i.description LIKE ?
      ORDER BY i.created_at DESC LIMIT 25`, 2, like),
  };
}

router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, config.maxSearchQuery);
  if (!q) return res.json(EMPTY);
  res.json(buildSearch(q));
});

module.exports = router;