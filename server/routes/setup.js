const express = require('express');
const db = require('../db').pool;
const { loadTemplate, TEMPLATES } = require('../seed-data');

const router = express.Router();

const DATA_TABLES = ['diagram', 'monitor_history', 'monitoring_history', 'issues', 'cables', 'devices', 'outlets', 'patch_panels', 'vlans', 'rooms'];

function templateSummary() {
  return Object.values(TEMPLATES).map((t) => ({
    id: t.id,
    name: t.name,
    tagline: t.tagline,
    rooms: t.rooms.length,
    outlets: t.outlets.length,
    vlans: t.vlans.length,
    devices: t.devices.length,
  }));
}

async function getSettings() {
  const { rows } = await db.query('SELECT org_name, installed_at FROM settings WHERE id=$1', [1]);
  const row = rows[0];
  return row || { org_name: null, installed_at: null };
}

router.get('/setup', async (req, res) => {
  const s = await getSettings();
  const { rows } = await db.query('SELECT COUNT(*) AS c FROM devices');
  const demoLoaded = rows[0].c > 0;
  res.json({ configured: Boolean(s.org_name), org_name: s.org_name, demo: demoLoaded, templates: templateSummary() });
});

router.post('/setup', async (req, res) => {
  const { org_name, demo, clear, template } = req.body || {};
  const existing = await db.query('SELECT org_name FROM settings WHERE id=$1', [1]);
  const org = String(org_name || '').trim().slice(0, 120) || (existing.rows[0] && existing.rows[0].org_name) || 'NetVisor Suite';
  await db.query('INSERT INTO settings (id, org_name, installed_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (id) DO UPDATE SET org_name=excluded.org_name', [1, org]);
  if (clear) {
    for (const t of DATA_TABLES) {
      await db.query(`DELETE FROM ${t}`);
    }
  } else if (template && TEMPLATES[template]) {
    await loadTemplate(db, template);
  } else if (demo) {
    await loadTemplate(db, 'office');
  }
  res.json(await getSettings());
});

router.get('/settings', async (req, res) => res.json(await getSettings()));

module.exports = router;