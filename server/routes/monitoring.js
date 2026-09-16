const express = require('express');
const db = require('../db').pool;
const { notFound } = require('../lib/errors');
const { ping } = require('../lib/monitor');
const { setDefaultOrg } = require('../middleware/default-org');

const router = express.Router();

// Use default org for unauthenticated access
router.use(setDefaultOrg);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const MONITORED_TYPES = ['Router', 'Switch'];

async function monitoredDevices(orgId) {
  const { rows } = await db.query('SELECT * FROM devices WHERE (monitored=1 OR device_type IN ($1,$2)) AND org_id = $3', [...MONITORED_TYPES, orgId]);
  return rows;
}

async function recordCheck(device) {
  const result = await ping(device.ip);
  const status = result.alive ? 'up' : 'down';
  await db.query('INSERT INTO monitor_history (device_id, status, rtt_ms) VALUES ($1,$2,$3)', [device.id, status, result.rttMs]);
  if (result.alive) await db.query('UPDATE devices SET monitored=1 WHERE id=$1', [device.id]);
  return { id: device.id, name: device.name, ip: device.ip, status, rttMs: result.rttMs };
}

router.post('/monitor/check/:id', wrap(async (req, res) => {
  const orgId = req.user.orgId;
  const device = await db.query('SELECT * FROM devices WHERE id=$1 AND org_id=$2', [req.params.id, orgId]).then(r => r.rows[0]);
  if (!device || !device.ip) throw notFound('device or ip missing');
  const result = await recordCheck(device);
  res.json(result);
}));

router.post('/monitor/check-all', wrap(async (req, res) => {
  const orgId = req.user.orgId;
  const targets = await monitoredDevices(orgId);
  const results = await Promise.all(targets.map((d) => recordCheck(d)));
  res.json(results);
}));

router.get('/monitor/status', async (req, res) => {
  const orgId = req.user.orgId;
  const { rows } = await db.query(`
    SELECT d.id, d.name, d.ip, d.device_type,
      (SELECT status FROM monitor_history m WHERE m.device_id = d.id ORDER BY m.id DESC LIMIT 1) AS last_status,
      (SELECT rtt_ms FROM monitor_history m WHERE m.device_id = d.id ORDER BY m.id DESC LIMIT 1) AS last_rtt,
      (SELECT checked_at FROM monitor_history m WHERE m.device_id = d.id ORDER BY m.id DESC LIMIT 1) AS last_checked
    FROM devices d
    WHERE (d.monitored=1 OR d.device_type IN ($1,$2)) AND d.org_id = $3
    ORDER BY d.name`, [...MONITORED_TYPES, orgId]);
  res.json(rows);
});

router.get('/monitor/history/:id', async (req, res) => {
  const orgId = req.user.orgId;
  const device = await db.query('SELECT id FROM devices WHERE id=$1 AND org_id=$2', [req.params.id, orgId]).then(r => r.rows[0]);
  if (!device) throw notFound('device not found');
  const { rows } = await db.query('SELECT * FROM monitor_history WHERE device_id=$1 ORDER BY id DESC LIMIT 50', [req.params.id]);
  res.json(rows);
});

module.exports = router;
