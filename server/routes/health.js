const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/health', async (req, res) => {
  let dbOk = false;
  try {
    await db.pool.query('SELECT 1 AS ok');
    dbOk = true;
  } catch {
    dbOk = false;
  }
  res.json({
    ok: dbOk,
    uptimeSec: Math.round(process.uptime()),
    app: 'network-management-suite',
    db: dbOk ? 'ok' : 'error',
  });
});

router.get('/health/live', (req, res) => {
  res.json({ ok: true, status: 'alive' });
});

router.get('/health/ready', async (req, res) => {
  let dbOk = false;
  try {
    await db.pool.query('SELECT 1 AS ok');
    dbOk = true;
  } catch {
    dbOk = false;
  }
  res.json({
    ok: dbOk,
    uptimeSec: Math.round(process.uptime()),
    app: 'network-management-suite',
    db: dbOk ? 'ok' : 'error',
  });
});

module.exports = router;
