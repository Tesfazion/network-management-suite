const express = require('express');
const db = require('../db').pool;
const config = require('../config');

const router = express.Router();

const EMPTY = { devices: [], cables: [], outlets: [], rooms: [], issues: [], vlans: [] };

async function searchAll(sql, paramCount, like) {
  const params = Array.from({ length: paramCount }, () => like);
  const { rows } = await db.query(sql, params);
  return rows;
}

async function buildSearch(q) {
  const like = `%${q}%`;
  return {
    devices: searchAll(`
      SELECT d.id, d.name, d.ip, d.device_type, d.location, v.name AS vlan_name
      FROM devices d LEFT JOIN vlans v ON v.id = d.vlan_id
      WHERE d.name LIKE $1 OR d.ip LIKE $2 OR d.mac LIKE $3 OR d.location LIKE $4
      ORDER BY d.name LIMIT 25`, 4, like),
    cables: searchAll(`
      SELECT c.id, c.cable_id, c.test_result, c.status, o.label AS outlet_label
      FROM cables c LEFT JOIN outlets o ON o.id = c.outlet_id
      WHERE c.cable_id LIKE $1 OR c.notes LIKE $2
      ORDER BY c.cable_id LIMIT 25`, 2, like),
    outlets: searchAll(`
      SELECT o.id, o.label, o.location, r.name AS room_name
      FROM outlets o JOIN rooms r ON r.id = o.room_id
      WHERE o.label LIKE $1 OR o.location LIKE $2
      ORDER BY o.label LIMIT 25`, 2, like),
    rooms: searchAll(
      'SELECT id, name, floor, purpose FROM rooms WHERE name LIKE $1 OR purpose LIKE $2 LIMIT 25', 2, like),
    vlans: searchAll(
      'SELECT id, vlan_id, name, subnet FROM vlans WHERE name LIKE $1 OR subnet LIKE $2 LIMIT 25', 2, like),
    issues: searchAll(`
      SELECT i.id, i.title, i.status, i.severity
      FROM issues i WHERE i.title LIKE $1 OR i.description LIKE $2
      ORDER BY i.created_at DESC LIMIT 25`, 2, like),
  };
}

router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, config.maxSearchQuery);
  if (!q) return res.json(EMPTY);
  const results = await buildSearch(q);
  const payload = {
    devices: await results.devices,
    cables: await results.cables,
    outlets: await results.outlets,
    rooms: await results.rooms,
    vlans: await results.vlans,
    issues: await results.issues,
  };
  res.json(payload);
});

module.exports = router;
