const express = require('express');
const db = require('../db').pool;
const { notFound, badRequest } = require('../lib/errors');
const { ipConflicts } = require('../lib/iputil');
const validation = require('../lib/validation');
const pagination = require('../lib/pagination');
const { authenticate, requireOrganization } = require('../middleware/authenticate');

const router = express.Router();

// Apply authentication and org context to all routes
router.use(authenticate);
router.use(requireOrganization);

router.get('/vlans', async (req, res) => {
  const orgId = req.user.orgId;
  const page = pagination.parse(req.query);
  const { sql, params } = pagination.apply('SELECT * FROM vlans WHERE org_id = $1 ORDER BY vlan_id', page, [orgId]);
  const { rows } = await db.query(sql, params);
  res.json(rows);
});

router.post('/vlans', async (req, res) => {
  const orgId = req.user.orgId;
  const vlan_id = validation.optionalInt(req.body.vlan_id);
  if (vlan_id === null || vlan_id < 1 || vlan_id > 4094) {
    throw badRequest('vlan_id must be an integer between 1 and 4094');
  }
  const name = validation.textRequired(req.body.name, validation.LIMITS.name, 'name');
  const subnet = validation.optionalSubnet(req.body.subnet);
  const gateway = validation.optionalIp(req.body.gateway, 'gateway');
  const description = validation.text(req.body.description, validation.LIMITS.description);

  const { rows } = await db.query(
    'INSERT INTO vlans (vlan_id, name, subnet, gateway, description, org_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', 
    [vlan_id, name, subnet, gateway, description || null, orgId]
  );
  res.json(rows[0]);
});

router.patch('/vlans/:id', async (req, res) => {
  const orgId = req.user.orgId;
  const vlan = await db.query('SELECT * FROM vlans WHERE id=$1 AND org_id=$2', [req.params.id, orgId]).then(r => r.rows[0]);
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
  await db.query('UPDATE vlans SET vlan_id=$1, name=$2, subnet=$3, gateway=$4, description=$5 WHERE id=$6 AND org_id=$7', [vlan_id, name, subnet, gateway, description, req.params.id, orgId]);
  const { rows } = await db.query('SELECT * FROM vlans WHERE id=$1 AND org_id=$2', [req.params.id, orgId]);
  res.json(rows[0]);
});

router.delete('/vlans/:id', async (req, res) => {
  const orgId = req.user.orgId;
  const vlan = await db.query('SELECT * FROM vlans WHERE id=$1 AND org_id=$2', [req.params.id, orgId]).then(r => r.rows[0]);
  if (!vlan) throw notFound();
  const result = await db.query('UPDATE devices SET vlan_id=NULL WHERE vlan_id=$1 AND org_id=$2', [req.params.id, orgId]);
  const detached = result.rowCount;
  await db.query('DELETE FROM vlans WHERE id=$1 AND org_id=$2', [req.params.id, orgId]);
  res.json({ ok: true, detachedDevices: detached });
});

const DEVICE_TYPES = ['Router', 'Switch', 'Server', 'Workstation'];

router.get('/devices', async (req, res) => {
  const orgId = req.user.orgId;
  const page = pagination.parse(req.query);
  const { sql, params } = pagination.apply(`
    SELECT d.*, v.name AS vlan_name, v.vlan_id AS vlan_number
    FROM devices d LEFT JOIN vlans v ON v.id = d.vlan_id
    WHERE d.org_id = $1
    ORDER BY d.name`, page, [orgId]);
  const { rows } = await db.query(sql, params);
  res.json(rows);
});

router.post('/devices', async (req, res) => {
  const orgId = req.user.orgId;
  const name = validation.textRequired(req.body.name, validation.LIMITS.name, 'name');
  const ip = validation.optionalIp(req.body.ip);
  const device_type = validation.oneOf(req.body.device_type, DEVICE_TYPES, null, 'device_type');
  const vlan_id = validation.optionalId(req.body.vlan_id, 'vlan_id');
  const mac = validation.text(req.body.mac, validation.LIMITS.mac);
  const location = validation.text(req.body.location, validation.LIMITS.location);
  const monitored = validation.boolFlag(req.body.monitored);

  const { rows } = await db.query(
    'INSERT INTO devices (name, ip, device_type, vlan_id, mac, location, monitored, org_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
    [name, ip, device_type, vlan_id, mac || null, location || null, monitored, orgId]);
  res.json(rows[0]);
});

router.patch('/devices/:id', async (req, res) => {
  const orgId = req.user.orgId;
  const device = await db.query('SELECT * FROM devices WHERE id=$1 AND org_id=$2', [req.params.id, orgId]).then(r => r.rows[0]);
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
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k}=$${i + 1}`).join(', ');
  const values = keys.map((k) => {
    const v = fields[k];
    return v === '' ? null : v;
  });
  values.push(req.params.id);
  values.push(orgId);
  await db.query(`UPDATE devices SET ${sets} WHERE id=$${values.length - 1} AND org_id=$${values.length}`, values);
  const { rows } = await db.query('SELECT * FROM devices WHERE id=$1 AND org_id=$2', [req.params.id, orgId]);
  res.json(rows[0]);
});

router.delete('/devices/:id', async (req, res) => {
  const orgId = req.user.orgId;
  await db.query('DELETE FROM devices WHERE id=$1 AND org_id=$2', [req.params.id, orgId]);
  res.json({ ok: true });
});

router.get('/conflicts', async (req, res) => {
  const orgId = req.user.orgId;
  const { duplicates, warnings, gatewayWarnings } = await ipConflicts(db, orgId);
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
