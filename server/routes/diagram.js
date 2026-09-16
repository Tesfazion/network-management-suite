const express = require('express');
const db = require('../db').pool;
const { optionalAuth } = require('../middleware/authenticate');
const { setDefaultOrg } = require('../middleware/default-org');

const router = express.Router();

// Honor the caller's JWT organization when a token is supplied;
// otherwise fall back to the default org for unauthenticated access.
router.use(optionalAuth);
router.use(setDefaultOrg);

const DIAGRAM_DEFAULT = { nodes: [], links: [], zones: [] };
const LIMITS = { nodes: 250, links: 500, zones: 60 };
const NODE_TYPES = ['router', 'switch', 'server', 'pc', 'laptop', 'printer', 'cloud', 'firewall', 'phone', 'tablet', 'hub', 'bridge', 'wireless', 'modem'];
const LINK_TYPES = ['copper', 'fiber', 'wireless', 'console', 'serial'];
const NODE_STATUSES = ['up', 'down', 'unknown'];

async function getDiagram(orgId) {
  const { rows } = await db.query('SELECT data FROM diagram WHERE id=$1 AND org_id=$2', [1, orgId]);
  const row = rows[0];
  if (!row) return DIAGRAM_DEFAULT;
  try { return JSON.parse(row.data); } catch { return DIAGRAM_DEFAULT; }
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

router.get('/diagram', async (req, res) => res.json(await getDiagram(req.user.orgId)));

router.put('/diagram', async (req, res) => {
  const orgId = req.user.orgId;
  const body = req.body || {};

  const zones = (Array.isArray(body.zones) ? body.zones : [])
    .slice(0, LIMITS.zones)
    .map((z) => ({
      id: String(z.id ?? '').slice(0, 64),
      label: String(z.label || 'Site').slice(0, 80),
      x: clampInt(z.x, 0, 10000, 0),
      y: clampInt(z.y, 0, 10000, 0),
      w: clampInt(z.w, 60, 10000, 180),
      h: clampInt(z.h, 60, 10000, 140),
      room_id: z.room_id != null && z.room_id !== '' ? clampInt(z.room_id, 1, 100000, null) : null,
    }));

  const zoneIds = new Set(zones.map((z) => z.id));
  const nodes = (Array.isArray(body.nodes) ? body.nodes : [])
    .slice(0, LIMITS.nodes)
    .map((n) => ({
      id: String(n.id ?? '').slice(0, 64),
      type: NODE_TYPES.includes(n.type) ? n.type : 'router',
      label: String(n.label || '').slice(0, 80),
      x: clampInt(n.x, 0, 10000, 0),
      y: clampInt(n.y, 0, 10000, 0),
      device_id: n.device_id != null && n.device_id !== '' ? clampInt(n.device_id, 1, 100000, null) : null,
      zone: zoneIds.has(n.zone) ? String(n.zone) : null,
      status: NODE_STATUSES.includes(n.status) ? n.status : 'unknown',
      ip: String(n.ip || '').slice(0, 45),
      mac: String(n.mac || '').slice(0, 20),
    }));

  const links = (Array.isArray(body.links) ? body.links : [])
    .slice(0, LIMITS.links)
    .map((l) => ({
      from: String(l.from ?? '').slice(0, 64),
      to: String(l.to ?? '').slice(0, 64),
      type: LINK_TYPES.includes(l.type) ? l.type : 'copper',
      label: String(l.label || '').slice(0, 40),
    }))
    .filter((l) => l.from && l.to && l.from !== l.to);

  await db.query(
    'INSERT INTO diagram (id, data, updated_at, org_id) VALUES ($1, $2, CURRENT_TIMESTAMP, $3) ON CONFLICT (org_id, id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at',
    [1, JSON.stringify({ nodes, links, zones }), orgId]
  );
  res.json({ ok: true, nodes: nodes.length, links: links.length, zones: zones.length });
});

module.exports = router;