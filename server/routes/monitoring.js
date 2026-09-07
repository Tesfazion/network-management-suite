const express = require('express');
const db = require('../db');
const { notFound } = require('../lib/errors');
const { ping } = require('../lib/monitor');

const router = express.Router();

/** Wrap an async route handler so rejected promises reach the central error handler. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const MONITORED_TYPES = ['Router', 'Switch'];

/** Return devices that are explicitly monitored or are infrastructure types. */
function monitoredDevices() {
  return db.prepare('SELECT * FROM devices WHERE monitored=1 OR device_type IN (?,?)').all(...MONITORED_TYPES);
}

/**
 * Ping a device and persist the result.
 * @param {object} device - Device row from the database.
 * @returns {Promise<{id: number, name: string, ip: string, status: string, rttMs: number|null}>}
 */
function recordCheck(device) {
  return ping(device.ip).then((result) => {
    const status = result.alive ? 'up' : 'down';
    db.prepare('INSERT INTO monitor_history (device_id, status, rtt_ms) VALUES (?,?,?)')
      .run(device.id, status, result.rttMs);
    if (result.alive) db.prepare('UPDATE devices SET monitored=1 WHERE id=?').run(device.id);
    return { id: device.id, name: device.name, ip: device.ip, status, rttMs: result.rttMs };
  });
}

router.post('/monitor/check/:id', wrap(async (req, res) => {
  const device = db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id);
  if (!device || !device.ip) throw notFound('device or ip missing');
  const result = await recordCheck(device);
  res.json(result);
}));

router.post('/monitor/check-all', wrap(async (req, res) => {
  const targets = monitoredDevices();
  const results = await Promise.all(targets.map((d) => recordCheck(d)));
  res.json(results);
}));

router.get('/monitor/status', (req, res) => {
  res.json(db.prepare(`
    SELECT d.id, d.name, d.ip, d.device_type,
      (SELECT status FROM monitor_history m WHERE m.device_id = d.id ORDER BY m.id DESC LIMIT 1) AS last_status,
      (SELECT rtt_ms FROM monitor_history m WHERE m.device_id = d.id ORDER BY m.id DESC LIMIT 1) AS last_rtt,
      (SELECT checked_at FROM monitor_history m WHERE m.device_id = d.id ORDER BY m.id DESC LIMIT 1) AS last_checked
    FROM devices d
    WHERE d.monitored=1 OR d.device_type IN (?,?)
    ORDER BY d.name`).all(...MONITORED_TYPES));
});

router.get('/monitor/history/:id', (req, res) => {
  res.json(db.prepare('SELECT * FROM monitor_history WHERE device_id=? ORDER BY id DESC LIMIT 50')
    .all(req.params.id));
});

module.exports = router;