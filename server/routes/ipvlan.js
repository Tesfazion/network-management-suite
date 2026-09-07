const express = require('express');
const db = require('../db');
const { notFound } = require('../lib/errors');
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
    const { badRequest } = require('../lib/errors');
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
  const name = body.name === undefined ? undefined : validation.text(body.name, validation.LIMITS.name);
  const ip = body.ip === undefined ? undefined : validation.optionalIp(body.ip);
  const device_type = body.device_type === undefined
    ? undefined
    : validation.oneOf(body.device_type, DEVICE_TYPES, device.device_type, 'device_type');
  const vlan_id = body.vlan_id === undefined ? undefined : validation.optionalId(body.vlan_id, 'vlan_id');
  const mac = body.mac === undefined ? undefined : validation.text(body.mac, validation.LIMITS.mac);
  const location = body.location === undefined ? undefined : validation.text(body.location, validation.LIMITS.location);
  const monitored = body.monitored === undefined ? undefined : validation.boolFlag(body.monitored);

  db.prepare(`UPDATE devices SET
    name=COALESCE(?,name), ip=COALESCE(?,ip), device_type=COALESCE(?,device_type),
    vlan_id=COALESCE(?,vlan_id), mac=COALESCE(?,mac), location=COALESCE(?,location),
    monitored=COALESCE(?,monitored) WHERE id=?`)
    .run(name ?? null, ip ?? null, device_type ?? null, vlan_id ?? null,
      mac ?? null, location ?? null, monitored ?? null, req.params.id);
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