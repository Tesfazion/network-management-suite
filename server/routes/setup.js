const express = require('express');
const db = require('../db');
const { loadDemo } = require('../seed-data');

const router = express.Router();

function getSettings() {
  const row = db.prepare('SELECT org_name, installed_at FROM settings WHERE id=1').get();
  return row || { org_name: null, installed_at: null };
}

router.get('/setup', (req, res) => {
  const s = getSettings();
  const demoLoaded = db.prepare('SELECT COUNT(*) c FROM devices').get().c > 0;
  res.json({ configured: Boolean(s.org_name), org_name: s.org_name, demo: demoLoaded });
});

router.post('/setup', (req, res) => {
  const { org_name, demo } = req.body || {};
  const org = String(org_name || '').trim().slice(0, 120) || 'Network Management Suite';
  db.prepare(`INSERT INTO settings (id, org_name, installed_at) VALUES (1, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET org_name=excluded.org_name`).run(org);
  if (demo) loadDemo(db);
  res.json(getSettings());
});

router.get('/settings', (req, res) => res.json(getSettings()));

module.exports = router;