const express = require('express');
const db = require('../db').pool;
const { loadDemo } = require('../seed-data');

const router = express.Router();

async function getSettings() {
  const { rows } = await db.query('SELECT org_name, installed_at FROM settings WHERE id=$1', [1]);
  const row = rows[0];
  return row || { org_name: null, installed_at: null };
}

router.get('/setup', async (req, res) => {
  const s = await getSettings();
  const { rows } = await db.query('SELECT COUNT(*) AS c FROM devices');
  const demoLoaded = rows[0].c > 0;
  res.json({ configured: Boolean(s.org_name), org_name: s.org_name, demo: demoLoaded });
});

router.post('/setup', async (req, res) => {
  const { org_name, demo } = req.body || {};
  const org = String(org_name || '').trim().slice(0, 120) || 'Network Management Suite';
  await db.query('INSERT INTO settings (id, org_name, installed_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (id) DO UPDATE SET org_name=excluded.org_name', [1, org]);
  if (demo) await loadDemo(db);
  res.json(await getSettings());
});

router.get('/settings', async (req, res) => res.json(await getSettings()));

module.exports = router;
