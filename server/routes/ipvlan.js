const express = require('express');
const db = require('../db');
const { notFound, badRequest } = require('../lib/errors');
const { ipConflicts } = require('../lib/iputil');
const validation = require('../lib/validation');

const router = express.Router();

// ---- VLANs ----------------------------------------------------------
router.get('/vlans', (req, res) => {
  res.json(db.prepare('SELECT * FROM vlans ORDER BY vlan_id').all());
});

router.post('/vlans', (req, res) => {
  const vlan_id = validation.optionalInt(req.body.vlan_id);
  if (vlan_id === null || vlan_id < 1 || vlan_id > 4094) {
    throw badRequest('vlan_id must be an integer between 1 and 4094');
  }
  const name = validation.textRequired(req.body.name, validation.LIMITS.name, 'name');
  const subnet = validation.optionalSubnet(req.body.subnet);
  const gateway = validation.optionalIp(req.body.gateway, 'gateway');
  const description = validation.text(req.body.description, validation.LIMITS.description);

  const r = db.prepare('INSERT INTO vlans (vlan_id, name, subnet, gateway, description) VALUES (?,?,?,?,?)')
    .run(vlan_id, name, subnet, gateway, description || null);
  res.json(db.prepare('SELECT * FROM vlans WHERE id=?').get(r.lastInsertRowid));
});

router.patch('/vlans/:id', (req, res) => {
  const vlan = db.prepare('SELECT * FROM vlans WHERE id=?').get(req.params.id);
  if (!vlan) throw notFound();
  const body = req.body;
  const vlan_id = body.vlan_id === undefined ? vlan.vlan_id : validation.optionalInt(body.vlan_id);
  if (vlan_id === null || vlan_id < 1 || vlan_id > 4094) {
    throw badRequest('vlan_id must be an integer between 1 and 4094');
  }
  const name = body.name === undefined
    ? vlan.name
    : validation.textRequired(body.name, validation.LIMITS.name, 'name');
  const subnet = body.subnet === undefined ? vlan.subnet : validation.optionalSubnet(body.subnet);
  const gateway = body.gateway === undefined ? vlan.gateway : validation.optionalIp(body.gateway, 'gateway');
  const description = body.description === undefined
    ? vlan.description
    : (validation.text(body.description, validation.LIMITS.description) || null);
  db.prepare('UPDATE vlans SET vlan_id=?, name=?, subnet=?, gateway=?, description=? WHERE id=?')
    .run(vlan_id, name, subnet, gateway, description, req.params.id);
  res.json(db.prepare('SELECT * FROM vlans WHERE id=?').get(req.params.id));
});

// ---- Devices ----------------------------------------------------------
const DEVICE_TYPES = ['Router', 'Switch', 'Server', 'Workstation'];

router.get('/devices', (req, res) => {
  res.json(db.prepare(`
    SELECT d.*, v.name AS vlan_name, v.vlan_id AS vlan_number
    FROM devices d LEFT JOIN vlans v ON v.id = d.vlan_id
    ORDER BY d.name`).all());
});

router.post('/devices', (req, res) => {
  const name = validation.textRequired(req.body.name, validation.LIMITS.name, 'name');
  const ip = validation.optionalIp(req.body.ip);
  const device_type = validation.oneOf(req.body.device_type, DEVICE_TYPES, null, 'device_type');
  const vlan_id = validation.optionalId(req.body.vlan_id, 'vlan_id');
  const mac = validation.text(req.body.mac, validation.LIMITS.mac);
  const location = validation.text(req.body.location, validation.LIMITS.location);
  const monitored = validation.boolFlag(req.body.monitored);

  const r = db.prepare(`
    INSERT INTO devices (name, ip, device_type, vlan_id, mac, location, monitored)
    VALUES (?,?,?,?,?,?,?)`)
    .run(name, ip, device_type, vlan_id, mac || null, location || null, monitored);
  res.json(db.prepare('SELECT * FROM devices WHERE id=?').get(r.lastInsertRowid));
});

router.patch('/devices/:id', (req, res) => {
  const device = db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id);
  if (!device) throw notFound();
  const body = req.body;
  const fields = {};
  if (body.name !== undefined) fields.name = validation.textRequired(body.name, validation.LIMITS.name, 'name');
  if (body.ip !== undefined) fields.ip = validation.optionalIp(body.ip);
  if (body.device_type !== undefined) fields.device_type = validation.oneOf(body.device_type, DEVICE_TYPES, device.device_type, 'device_type');
  if (body.vlan_id !== undefined) fields.vlan_id = validation.optionalId(body.vlan_id, 'vlan_id');
  if (body.mac !== undefined) fields.mac = validation.text(body.mac, validation.LIMITS.mac);
  if (body.location !== undefined) fields.location = validation.text(body.location, validation.LIMITS.location);
  if (body.monitored !== undefined) fields.monitored = validation.boolFlag(body.monitored);

  if (Object.keys(fields).length === 0) return res.json(device);
  const sets = Object.keys(fields).map((k) => `${k}=?`).join(', ');
  // Mirror POST semantics: blank optional fields are stored as NULL.
  const values = Object.keys(fields).map((k) => {
    const v = fields[k];
    return v === '' ? null : v;
  });
  db.prepare(`UPDATE devices SET ${sets} WHERE id=?`).run(...values, req.params.id);
  res.json(db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id));
});

router.delete('/devices/:id', (req, res) => {
  db.prepare('DELETE FROM devices WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---- IP conflict audit ------------------------------------------------
router.get('/conflicts', (req, res) => {
  const { duplicates, warnings, gatewayWarnings } = ipConflicts(db);
  res.json({
    duplicateIps: duplicates.map(([a, b]) => ({
      ip: a.ip,
      message: `${a.name} conflicts with ${b.name}`,
      devices: [a, b].map((d) => ({ id: d.id, name: d.name })),
    })),
    outsideSubnet: warnings.map(({ device, vlan }) => ({
      message: `${device.name} (${device.ip}) is outside VLAN ${vlan.vlan_id} ${vlan.name} subnet ${vlan.subnet}`,
      deviceId: device.id,
    })),
    gatewayConflicts: gatewayWarnings.map(({ device, vlan }) => ({
      message: `${device.name} is using the VLAN ${vlan.vlan_id} gateway address ${vlan.gateway}`,
      deviceId: device.id,
    })),
  });
});

module.exports = router;