const express = require('express');
const db = require('../db');
const { notFound } = require('../lib/errors');
const validation = require('../lib/validation');

const router = express.Router();

// ---- Rooms -------------------------------------------------------
router.get('/rooms', (req, res) => {
  res.json(db.prepare('SELECT * FROM rooms ORDER BY name').all());
});

router.post('/rooms', (req, res) => {
  const name = validation.textRequired(req.body.name, validation.LIMITS.name, 'name');
  const floor = validation.text(req.body.floor, validation.LIMITS.label);
  const purpose = validation.text(req.body.purpose, 120);
  const r = db.prepare('INSERT INTO rooms (name, floor, purpose) VALUES (?,?,?)')
    .run(name, floor || null, purpose || null);
  res.json(db.prepare('SELECT * FROM rooms WHERE id=?').get(r.lastInsertRowid));
});

router.patch('/rooms/:id', (req, res) => {
  const room = db.prepare('SELECT * FROM rooms WHERE id=?').get(req.params.id);
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
  db.prepare('UPDATE rooms SET name=?, floor=?, purpose=? WHERE id=?')
    .run(name, floor, purpose, req.params.id);
  res.json(db.prepare('SELECT * FROM rooms WHERE id=?').get(req.params.id));
});

router.delete('/rooms/:id', (req, res) => {
  db.prepare('DELETE FROM rooms WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Wall outlets -------------------------------------------------
router.get('/outlets', (req, res) => {
  res.json(db.prepare(`
    SELECT outlets.*, rooms.name AS room_name
    FROM outlets JOIN rooms ON rooms.id = outlets.room_id
    ORDER BY outlets.label`).all());
});

router.post('/outlets', (req, res) => {
  const room_id = validation.requiredId(req.body.room_id, 'room_id');
  const label = validation.textRequired(req.body.label, validation.LIMITS.label, 'label');
  const location = validation.text(req.body.location, validation.LIMITS.location);
  const r = db.prepare('INSERT INTO outlets (room_id, label, location) VALUES (?,?,?)')
    .run(room_id, label, location || null);
  res.json(db.prepare('SELECT * FROM outlets WHERE id=?').get(r.lastInsertRowid));
});

router.patch('/outlets/:id', (req, res) => {
  const outlet = db.prepare('SELECT * FROM outlets WHERE id=?').get(req.params.id);
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
  db.prepare('UPDATE outlets SET room_id=?, label=?, location=? WHERE id=?')
    .run(room_id, label, location, req.params.id);
  res.json(db.prepare('SELECT * FROM outlets WHERE id=?').get(req.params.id));
});

router.delete('/outlets/:id', (req, res) => {
  db.prepare('DELETE FROM outlets WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---- Patch panels --------------------------------------------------
router.get('/patchpanels', (req, res) => {
  res.json(db.prepare('SELECT * FROM patch_panels ORDER BY name').all());
});

router.post('/patchpanels', (req, res) => {
  const name = validation.textRequired(req.body.name, validation.LIMITS.name, 'name');
  const location = validation.text(req.body.location, validation.LIMITS.location);
  const ports = validation.optionalInt(req.body.ports);
  const r = db.prepare('INSERT INTO patch_panels (name, location, ports) VALUES (?,?,?)')
    .run(name, location || null, ports ?? 24);
  res.json(db.prepare('SELECT * FROM patch_panels WHERE id=?').get(r.lastInsertRowid));
});

router.patch('/patchpanels/:id', (req, res) => {
  const panel = db.prepare('SELECT * FROM patch_panels WHERE id=?').get(req.params.id);
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
  db.prepare('UPDATE patch_panels SET name=?, location=?, ports=? WHERE id=?')
    .run(name, location, ports, req.params.id);
  res.json(db.prepare('SELECT * FROM patch_panels WHERE id=?').get(req.params.id));
});

// ---- Cable runs -----------------------------------------------------
const TEST_RESULTS = ['Pass', 'Fail', 'Pending'];
const CABLE_STATUSES = ['Active', 'Inactive'];

router.get('/cables', (req, res) => {
  res.json(db.prepare(`
    SELECT c.*, o.label AS outlet_label, o.location AS outlet_location,
           r.name AS room_name, pp.name AS panel_name
    FROM cables c
    LEFT JOIN outlets o ON o.id = c.outlet_id
    LEFT JOIN rooms r ON r.id = o.room_id
    LEFT JOIN patch_panels pp ON pp.id = c.patch_panel_id
    ORDER BY c.cable_id`).all());
});

router.post('/cables', (req, res) => {
  const cable_id = validation.textRequired(req.body.cable_id, validation.LIMITS.label, 'cable_id');
  const outlet_id = validation.optionalId(req.body.outlet_id, 'outlet_id');
  const patch_panel_id = validation.optionalId(req.body.patch_panel_id, 'patch_panel_id');
  const patch_port = validation.text(req.body.patch_port, validation.LIMITS.label);
  const length_m = validation.optionalNum(req.body.length_m);
  const cable_type = validation.text(req.body.cable_type, 16);
  const test_result = validation.oneOf(req.body.test_result, TEST_RESULTS, 'Pending', 'test_result');
  const status = validation.oneOf(req.body.status, CABLE_STATUSES, 'Active', 'status');
  const notes = validation.text(req.body.notes, validation.LIMITS.notes);

  const r = db.prepare(`
    INSERT INTO cables (cable_id, outlet_id, patch_panel_id, patch_port, length_m, cable_type, test_result, status, notes)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(cable_id, outlet_id, patch_panel_id, patch_port || null, length_m,
      cable_type || 'Cat6', test_result, status, notes || null);
  res.json(db.prepare('SELECT * FROM cables WHERE id=?').get(r.lastInsertRowid));
});

router.patch('/cables/:id', (req, res) => {
  const cable = db.prepare('SELECT * FROM cables WHERE id=?').get(req.params.id);
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
  const sets = Object.keys(fields).map((k) => `${k}=?`).join(', ');
  db.prepare(`UPDATE cables SET ${sets} WHERE id=?`).run(...Object.values(fields), req.params.id);
  res.json(db.prepare('SELECT * FROM cables WHERE id=?').get(req.params.id));
});

router.delete('/cables/:id', (req, res) => {
  db.prepare('DELETE FROM cables WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;