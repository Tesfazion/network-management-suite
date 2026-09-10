const express = require('express');
const db = require('../db').pool;
const { notFound } = require('../lib/errors');
const validation = require('../lib/validation');
const pagination = require('../lib/pagination');

const router = express.Router();

router.get('/rooms', async (req, res) => {
  const page = pagination.parse(req.query);
  const { sql, params } = pagination.apply('SELECT * FROM rooms ORDER BY name', page);
  const { rows } = await db.query(sql, params);
  res.json(rows);
});

router.post('/rooms', async (req, res) => {
  const name = validation.textRequired(req.body.name, validation.LIMITS.name, 'name');
  const floor = validation.text(req.body.floor, validation.LIMITS.label);
  const purpose = validation.text(req.body.purpose, 120);
  const { rows } = await db.query('INSERT INTO rooms (name, floor, purpose) VALUES ($1,$2,$3) RETURNING *', [name, floor || null, purpose || null]);
  res.json(rows[0]);
});

router.patch('/rooms/:id', async (req, res) => {
  const room = await db.query('SELECT * FROM rooms WHERE id=$1', [req.params.id]).then(r => r.rows[0]);
  if (!room) throw notFound();
  const name = req.body.name === undefined
    ? room.name
    : validation.textRequired(req.body.name, validation.LIMITS.name, 'name');
  const floor = req.body.floor === undefined
    ? room.floor
    : (validation.text(req.body.floor, validation.LIMITS.label) || null);
  const purpose = req.body.purpose === undefined
    ? room.purpose
    : (validation.text(req.body.purpose, 120) || null);
  await db.query('UPDATE rooms SET name=$1, floor=$2, purpose=$3 WHERE id=$4', [name, floor, purpose, req.params.id]);
  const { rows } = await db.query('SELECT * FROM rooms WHERE id=$1', [req.params.id]);
  res.json(rows[0]);
});

router.delete('/rooms/:id', async (req, res) => {
  await db.query('DELETE FROM rooms WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

router.get('/outlets', async (req, res) => {
  const page = pagination.parse(req.query);
  const { sql, params } = pagination.apply(`
    SELECT outlets.*, rooms.name AS room_name
    FROM outlets JOIN rooms ON rooms.id = outlets.room_id
    ORDER BY outlets.label`, page);
  const { rows } = await db.query(sql, params);
  res.json(rows);
});

router.post('/outlets', async (req, res) => {
  const room_id = validation.requiredId(req.body.room_id, 'room_id');
  const label = validation.textRequired(req.body.label, validation.LIMITS.label, 'label');
  const location = validation.text(req.body.location, validation.LIMITS.location);
  const { rows } = await db.query('INSERT INTO outlets (room_id, label, location) VALUES ($1,$2,$3) RETURNING *', [room_id, label, location || null]);
  res.json(rows[0]);
});

router.patch('/outlets/:id', async (req, res) => {
  const outlet = await db.query('SELECT * FROM outlets WHERE id=$1', [req.params.id]).then(r => r.rows[0]);
  if (!outlet) throw notFound();
  const room_id = req.body.room_id === undefined
    ? outlet.room_id
    : validation.requiredId(req.body.room_id, 'room_id');
  const label = req.body.label === undefined
    ? outlet.label
    : validation.textRequired(req.body.label, validation.LIMITS.label, 'label');
  const location = req.body.location === undefined
    ? outlet.location
    : (validation.text(req.body.location, validation.LIMITS.location) || null);
  await db.query('UPDATE outlets SET room_id=$1, label=$2, location=$3 WHERE id=$4', [room_id, label, location, req.params.id]);
  const { rows } = await db.query('SELECT * FROM outlets WHERE id=$1', [req.params.id]);
  res.json(rows[0]);
});

router.delete('/outlets/:id', async (req, res) => {
  await db.query('DELETE FROM outlets WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

router.get('/patchpanels', async (req, res) => {
  const page = pagination.parse(req.query);
  const { sql, params } = pagination.apply('SELECT * FROM patch_panels ORDER BY name', page);
  const { rows } = await db.query(sql, params);
  res.json(rows);
});

router.post('/patchpanels', async (req, res) => {
  const name = validation.textRequired(req.body.name, validation.LIMITS.name, 'name');
  const location = validation.text(req.body.location, validation.LIMITS.location);
  const ports = validation.optionalInt(req.body.ports);
  const { rows } = await db.query('INSERT INTO patch_panels (name, location, ports) VALUES ($1,$2,$3) RETURNING *', [name, location || null, ports ?? 24]);
  res.json(rows[0]);
});

router.patch('/patchpanels/:id', async (req, res) => {
  const panel = await db.query('SELECT * FROM patch_panels WHERE id=$1', [req.params.id]).then(r => r.rows[0]);
  if (!panel) throw notFound();
  const name = req.body.name === undefined
    ? panel.name
    : validation.textRequired(req.body.name, validation.LIMITS.name, 'name');
  const location = req.body.location === undefined
    ? panel.location
    : (validation.text(req.body.location, validation.LIMITS.location) || null);
  const ports = req.body.ports === undefined
    ? panel.ports
    : (validation.optionalInt(req.body.ports) ?? panel.ports);
  await db.query('UPDATE patch_panels SET name=$1, location=$2, ports=$3 WHERE id=$4', [name, location, ports, req.params.id]);
  const { rows } = await db.query('SELECT * FROM patch_panels WHERE id=$1', [req.params.id]);
  res.json(rows[0]);
});

router.delete('/patchpanels/:id', async (req, res) => {
  const panel = await db.query('SELECT * FROM patch_panels WHERE id=$1', [req.params.id]).then(r => r.rows[0]);
  if (!panel) throw notFound();
  await db.query('DELETE FROM patch_panels WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

const TEST_RESULTS = ['Pass', 'Fail', 'Pending'];
const CABLE_STATUSES = ['Active', 'Inactive'];

router.get('/cables', async (req, res) => {
  const page = pagination.parse(req.query);
  const { sql, params } = pagination.apply(`
    SELECT c.*, o.label AS outlet_label, o.location AS outlet_location,
           r.name AS room_name, pp.name AS panel_name
    FROM cables c
    LEFT JOIN outlets o ON o.id = c.outlet_id
    LEFT JOIN rooms r ON r.id = o.room_id
    LEFT JOIN patch_panels pp ON pp.id = c.patch_panel_id
    ORDER BY c.cable_id`, page);
  const { rows } = await db.query(sql, params);
  res.json(rows);
});

router.post('/cables', async (req, res) => {
  const cable_id = validation.textRequired(req.body.cable_id, validation.LIMITS.label, 'cable_id');
  const outlet_id = validation.optionalId(req.body.outlet_id, 'outlet_id');
  const patch_panel_id = validation.optionalId(req.body.patch_panel_id, 'patch_panel_id');
  const patch_port = validation.text(req.body.patch_port, validation.LIMITS.label);
  const length_m = validation.optionalNum(req.body.length_m);
  const cable_type = validation.text(req.body.cable_type, 16);
  const test_result = validation.oneOf(req.body.test_result, TEST_RESULTS, 'Pending', 'test_result');
  const status = validation.oneOf(req.body.status, CABLE_STATUSES, 'Active', 'status');
  const notes = validation.text(req.body.notes, validation.LIMITS.notes);

  const { rows } = await db.query(
    'INSERT INTO cables (cable_id, outlet_id, patch_panel_id, patch_port, length_m, cable_type, test_result, status, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [cable_id, outlet_id, patch_panel_id, patch_port || null, length_m, cable_type || 'Cat6', test_result, status, notes || null]);
  res.json(rows[0]);
});

router.patch('/cables/:id', async (req, res) => {
  const cable = await db.query('SELECT * FROM cables WHERE id=$1', [req.params.id]).then(r => r.rows[0]);
  if (!cable) throw notFound();
  const body = req.body;
  const fields = {};
  if (body.cable_id !== undefined) fields.cable_id = validation.textRequired(body.cable_id, validation.LIMITS.label, 'cable_id');
  if (body.outlet_id !== undefined) fields.outlet_id = validation.optionalId(body.outlet_id, 'outlet_id');
  if (body.patch_panel_id !== undefined) fields.patch_panel_id = validation.optionalId(body.patch_panel_id, 'patch_panel_id');
  if (body.patch_port !== undefined) fields.patch_port = validation.text(body.patch_port, validation.LIMITS.label);
  if (body.length_m !== undefined) fields.length_m = validation.optionalNum(body.length_m);
  if (body.cable_type !== undefined) fields.cable_type = validation.text(body.cable_type, 16);
  if (body.test_result !== undefined) fields.test_result = validation.oneOf(body.test_result, TEST_RESULTS, cable.test_result, 'test_result');
  if (body.status !== undefined) fields.status = validation.oneOf(body.status, CABLE_STATUSES, cable.status, 'status');
  if (body.notes !== undefined) fields.notes = validation.text(body.notes, validation.LIMITS.notes);

  if (Object.keys(fields).length === 0) return res.json(cable);
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k}=$${i + 1}`).join(', ');
  const values = [...Object.values(fields), req.params.id];
  await db.query(`UPDATE cables SET ${sets} WHERE id=$${values.length}`, values);
  const { rows } = await db.query('SELECT * FROM cables WHERE id=$1', [req.params.id]);
  res.json(rows[0]);
});

router.delete('/cables/:id', async (req, res) => {
  await db.query('DELETE FROM cables WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
