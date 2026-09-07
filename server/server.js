const express = require('express');
const path = require('path');
const db = require('./db');
const { ping } = require('./monitor');
const { ipConflicts } = require('./iputil');
const { loadDemo } = require('./seed-data');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const wrap = (fn) => (req, res, next) => {
  try {
    fn(req, res, next);
  } catch (e) {
    next(e);
  }
};

// ---------- Rooms ----------
app.get('/api/rooms', (req, res) => {
  res.json(db.prepare('SELECT * FROM rooms ORDER BY name').all());
});

app.post('/api/rooms', (req, res) => {
  const { name, floor, purpose } = req.body;
  const r = db.prepare('INSERT INTO rooms (name, floor, purpose) VALUES (?,?,?)').run(name, floor, purpose);
  res.json(db.prepare('SELECT * FROM rooms WHERE id=?').get(r.lastInsertRowid));
});

app.delete('/api/rooms/:id', (req, res) => {
  db.prepare('DELETE FROM rooms WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Outlets ----------
app.get('/api/outlets', (req, res) => {
  res.json(db.prepare(`
    SELECT outlets.*, rooms.name AS room_name
    FROM outlets JOIN rooms ON rooms.id = outlets.room_id
    ORDER BY outlets.label`).all());
});

app.post('/api/outlets', (req, res) => {
  const { room_id, label, location } = req.body;
  const r = db.prepare('INSERT INTO outlets (room_id, label, location) VALUES (?,?,?)').run(room_id, label, location);
  res.json(db.prepare('SELECT * FROM outlets WHERE id=?').get(r.lastInsertRowid));
});

app.delete('/api/outlets/:id', (req, res) => {
  db.prepare('DELETE FROM outlets WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Patch panels ----------
app.get('/api/patchpanels', (req, res) => {
  res.json(db.prepare('SELECT * FROM patch_panels ORDER BY name').all());
});

app.post('/api/patchpanels', (req, res) => {
  const { name, location, ports } = req.body;
  const r = db.prepare('INSERT INTO patch_panels (name, location, ports) VALUES (?,?,?)').run(name, location, ports);
  res.json(db.prepare('SELECT * FROM patch_panels WHERE id=?').get(r.lastInsertRowid));
});

// ---------- Cables ----------
app.get('/api/cables', (req, res) => {
  res.json(db.prepare(`
    SELECT c.*, o.label AS outlet_label, o.location AS outlet_location,
           r.name AS room_name, pp.name AS panel_name
    FROM cables c
    LEFT JOIN outlets o ON o.id = c.outlet_id
    LEFT JOIN rooms r ON r.id = o.room_id
    LEFT JOIN patch_panels pp ON pp.id = c.patch_panel_id
    ORDER BY c.cable_id`).all());
});

app.post('/api/cables', (req, res) => {
  const { cable_id, outlet_id, patch_panel_id, patch_port, length_m, cable_type, test_result, status, notes } = req.body;
  const r = db.prepare(`
    INSERT INTO cables (cable_id, outlet_id, patch_panel_id, patch_port, length_m, cable_type, test_result, status, notes)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(cable_id, outlet_id, patch_panel_id, patch_port, length_m, cable_type, test_result, status, notes);
  res.json(db.prepare('SELECT * FROM cables WHERE id=?').get(r.lastInsertRowid));
});

app.patch('/api/cables/:id', (req, res) => {
  const { test_result, status } = req.body;
  const cable = db.prepare('SELECT * FROM cables WHERE id=?').get(req.params.id);
  if (!cable) return res.status(404).json({ error: 'not found' });
  db.prepare('UPDATE cables SET test_result=?, status=? WHERE id=?')
    .run(test_result ?? cable.test_result, status ?? cable.status, req.params.id);
  res.json(db.prepare('SELECT * FROM cables WHERE id=?').get(req.params.id));
});

app.delete('/api/cables/:id', (req, res) => {
  db.prepare('DELETE FROM cables WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- VLANs ----------
app.get('/api/vlans', (req, res) => {
  res.json(db.prepare('SELECT * FROM vlans ORDER BY vlan_id').all());
});

app.post('/api/vlans', (req, res) => {
  const { vlan_id, name, subnet, gateway, description } = req.body;
  const r = db.prepare('INSERT INTO vlans (vlan_id, name, subnet, gateway, description) VALUES (?,?,?,?,?)')
    .run(vlan_id, name, subnet, gateway, description);
  res.json(db.prepare('SELECT * FROM vlans WHERE id=?').get(r.lastInsertRowid));
});

// ---------- Devices ----------
app.get('/api/devices', (req, res) => {
  res.json(db.prepare(`
    SELECT d.*, v.name AS vlan_name, v.vlan_id AS vlan_number
    FROM devices d LEFT JOIN vlans v ON v.id = d.vlan_id
    ORDER BY d.name`).all());
});

function toMonitorFlag(v) {
  return (v === true || v === 1 || v === '1') ? 1 : 0;
}

app.post('/api/devices', (req, res) => {
  const { name, ip, device_type, vlan_id, mac, location, monitored } = req.body;
  const r = db.prepare('INSERT INTO devices (name, ip, device_type, vlan_id, mac, location, monitored) VALUES (?,?,?,?,?,?,?)')
    .run(name, ip, device_type, vlan_id, mac, location, toMonitorFlag(monitored));
  res.json(db.prepare('SELECT * FROM devices WHERE id=?').get(r.lastInsertRowid));
});

app.patch('/api/devices/:id', (req, res) => {
  const device = db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id);
  if (!device) return res.status(404).json({ error: 'not found' });
  const { name, ip, device_type, vlan_id, mac, location, monitored } = req.body;
  db.prepare(`UPDATE devices SET
    name=COALESCE(?,name), ip=COALESCE(?,ip), device_type=COALESCE(?,device_type),
    vlan_id=COALESCE(?,vlan_id), mac=COALESCE(?,mac), location=COALESCE(?,location),
    monitored=COALESCE(?,monitored) WHERE id=?`)
    .run(name, ip, device_type, vlan_id, mac, location,
      monitored === undefined ? undefined : toMonitorFlag(monitored), req.params.id);
  res.json(db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id));
});

app.delete('/api/devices/:id', (req, res) => {
  db.prepare('DELETE FROM devices WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- IP conflicts ----------
app.get('/api/conflicts', (req, res) => {
  const { duplicates, warnings, gatewayWarnings } = ipConflicts(db);
  const groups = duplicates.map(([a, b]) => ({
    ip: a.ip,
    message: `${a.name} conflicts with ${b.name}`,
    devices: [a, b].map((d) => ({ id: d.id, name: d.name })),
  }));
  res.json({
    duplicateIps: groups,
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

// ---------- Search ----------
app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ devices: [], cables: [], outlets: [], rooms: [], issues: [], vlans: [] });
  const like = `%${q}%`;
  const searchAll = (sql, paramCount) =>
    db.prepare(sql).all(...Array(paramCount).fill(like));
  res.json({
    devices: searchAll(`
      SELECT d.id, d.name, d.ip, d.device_type, d.location, v.name AS vlan_name
      FROM devices d LEFT JOIN vlans v ON v.id = d.vlan_id
      WHERE d.name LIKE ? OR d.ip LIKE ? OR d.mac LIKE ? OR d.location LIKE ?
      ORDER BY d.name LIMIT 25`, 4),
    cables: searchAll(`
      SELECT c.id, c.cable_id, c.test_result, c.status, o.label AS outlet_label
      FROM cables c LEFT JOIN outlets o ON o.id = c.outlet_id
      WHERE c.cable_id LIKE ? OR c.notes LIKE ?
      ORDER BY c.cable_id LIMIT 25`, 2),
    outlets: searchAll(`
      SELECT o.id, o.label, o.location, r.name AS room_name
      FROM outlets o JOIN rooms r ON r.id = o.room_id
      WHERE o.label LIKE ? OR o.location LIKE ?
      ORDER BY o.label LIMIT 25`, 2),
    rooms: searchAll('SELECT id, name, floor, purpose FROM rooms WHERE name LIKE ? OR purpose LIKE ? LIMIT 25', 2),
    vlans: searchAll('SELECT id, vlan_id, name, subnet FROM vlans WHERE name LIKE ? OR subnet LIKE ? LIMIT 25', 2),
    issues: searchAll(`
      SELECT i.id, i.title, i.status, i.severity
      FROM issues i WHERE i.title LIKE ? OR i.description LIKE ?
      ORDER BY i.created_at DESC LIMIT 25`, 2),
  });
});

// ---------- Issues (support incidents) ----------
app.get('/api/issues', (req, res) => {
  res.json(db.prepare(`
    SELECT i.*, d.name AS device_name, o.label AS outlet_label
    FROM issues i
    LEFT JOIN devices d ON d.id = i.device_id
    LEFT JOIN outlets o ON o.id = i.outlet_id
    ORDER BY
      CASE i.status WHEN 'Open' THEN 0 WHEN 'In Progress' THEN 1 WHEN 'Resolved' THEN 2 ELSE 3 END,
      i.created_at DESC`).all());
});

app.post('/api/issues', (req, res) => {
  const { title, description, severity, status, device_id, outlet_id, reporter } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const r = db.prepare(`
    INSERT INTO issues (title, description, severity, status, device_id, outlet_id, reporter)
    VALUES (?,?,?,?,?,?,?)`)
    .run(title, description, severity || 'Medium', status || 'Open', device_id || null, outlet_id || null, reporter || null);
  res.json(db.prepare('SELECT * FROM issues WHERE id=?').get(r.lastInsertRowid));
});

app.patch('/api/issues/:id', (req, res) => {
  const issue = db.prepare('SELECT * FROM issues WHERE id=?').get(req.params.id);
  if (!issue) return res.status(404).json({ error: 'not found' });
  const { title, description, severity, status, device_id, outlet_id, reporter } = req.body;
  const nextStatus = status ?? issue.status;
  const resolvedAt = nextStatus === 'Resolved' || nextStatus === 'Closed'
    ? (issue.resolved_at || new Date().toISOString().slice(0, 19).replace('T', ' '))
    : null;
  db.prepare(`UPDATE issues SET
    title=COALESCE(?,title), description=COALESCE(?,description), severity=COALESCE(?,severity),
    status=?, device_id=COALESCE(?,device_id), outlet_id=COALESCE(?,outlet_id),
    reporter=COALESCE(?,reporter), resolved_at=? WHERE id=?`)
    .run(title, description, severity, nextStatus, device_id, outlet_id, reporter, resolvedAt, req.params.id);
  res.json(db.prepare('SELECT * FROM issues WHERE id=?').get(req.params.id));
});

app.delete('/api/issues/:id', (req, res) => {
  db.prepare('DELETE FROM issues WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Diagram (visual editor canvas) ----------
const DIAGRAM_DEFAULT = { nodes: [], links: [], zones: [] };

function getDiagram() {
  const row = db.prepare('SELECT data FROM diagram WHERE id=1').get();
  if (!row) return DIAGRAM_DEFAULT;
  try { return JSON.parse(row.data); } catch { return DIAGRAM_DEFAULT; }
}

app.get('/api/diagram', (req, res) => res.json(getDiagram()));

app.put('/api/diagram', (req, res) => {
  const body = req.body || {};
  const zones = (Array.isArray(body.zones) ? body.zones : []).map((z) => ({
    id: String(z.id ?? ''),
    label: String(z.label || 'Site'),
    x: Math.max(0, Math.round(Number(z.x) || 0)),
    y: Math.max(0, Math.round(Number(z.y) || 0)),
    w: Math.max(60, Math.round(Number(z.w) || 180)),
    h: Math.max(60, Math.round(Number(z.h) || 140)),
    room_id: z.room_id != null && z.room_id !== '' ? Number(z.room_id) : null,
  }));
  const nodes = (Array.isArray(body.nodes) ? body.nodes : []).map((n) => ({
    id: String(n.id ?? ''),
    type: String(n.type || 'router'),
    label: String(n.label || ''),
    x: Math.max(0, Math.round(Number(n.x) || 0)),
    y: Math.max(0, Math.round(Number(n.y) || 0)),
    device_id: n.device_id != null && n.device_id !== '' ? Number(n.device_id) : null,
    zone: zones.some((z) => z.id === n.zone) ? String(n.zone) : null,
  }));
  const links = (Array.isArray(body.links) ? body.links : []).map((l) => ({
    from: String(l.from ?? ''), to: String(l.to ?? ''),
  })).filter((l) => l.from && l.to);
  db.prepare(`INSERT INTO diagram (id, data, updated_at) VALUES (1, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`)
    .run(JSON.stringify({ nodes, links, zones }));
  res.json({ ok: true, nodes: nodes.length, links: links.length, zones: zones.length });
});

// ---------- Setup / organization ----------
function getSettings() {
  const row = db.prepare('SELECT org_name, installed_at FROM settings WHERE id=1').get();
  return row || { org_name: null, installed_at: null };
}

app.get('/api/setup', (req, res) => {
  const s = getSettings();
  const demoLoaded = db.prepare('SELECT COUNT(*) c FROM devices').get().c > 0;
  res.json({ configured: Boolean(s.org_name), org_name: s.org_name, demo: demoLoaded });
});

app.post('/api/setup', (req, res) => {
  const { org_name, demo } = req.body || {};
  const org = String(org_name || '').trim() || 'Network Management Suite';
  db.prepare(`INSERT INTO settings (id, org_name, installed_at) VALUES (1, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET org_name=excluded.org_name`).run(org);
  if (demo) loadDemo(db);
  res.json(getSettings());
});

app.get('/api/settings', (req, res) => res.json(getSettings()));

// ---------- CSV export ----------
function toCsv(rows, headers) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return headers.map((h) => h[0]).join(',') + '\n' +
    rows.map((r) => headers.map(([, key]) => esc(r[key])).join(',')).join('\n');
}

app.get('/api/export/cables.csv', (req, res) => {
  const rows = db.prepare(`
    SELECT c.cable_id, r.name AS room, o.label AS outlet, o.location AS outlet_location,
           pp.name AS panel, c.patch_port, c.cable_type, c.length_m, c.test_result, c.status, c.notes
    FROM cables c
    LEFT JOIN outlets o ON o.id = c.outlet_id
    LEFT JOIN rooms r ON r.id = o.room_id
    LEFT JOIN patch_panels pp ON pp.id = c.patch_panel_id
    ORDER BY c.cable_id`).all();
  const csv = toCsv(rows, [
    ['Cable ID', 'cable_id'], ['Room', 'room'], ['Outlet', 'outlet'], ['Outlet Location', 'outlet_location'],
    ['Patch Panel', 'panel'], ['Port', 'patch_port'], ['Type', 'cable_type'],
    ['Length (m)', 'length_m'], ['Test Result', 'test_result'], ['Status', 'status'], ['Notes', 'notes'],
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="cable-log.csv"');
  res.send(csv);
});

app.get('/api/export/devices.csv', (req, res) => {
  const rows = db.prepare(`
    SELECT d.name, d.ip, d.device_type, d.mac, d.location, v.vlan_id AS vlan, v.name AS vlan_name, d.monitored
    FROM devices d LEFT JOIN vlans v ON v.id = d.vlan_id
    ORDER BY d.name`).all();
  const csv = toCsv(rows, [
    ['Name', 'name'], ['IP', 'ip'], ['Type', 'device_type'], ['MAC', 'mac'], ['Location', 'location'],
    ['VLAN ID', 'vlan'], ['VLAN Name', 'vlan_name'], ['Monitored', 'monitored'],
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="device-inventory.csv"');
  res.send(csv);
});

// ---------- Monitoring ----------
app.post('/api/monitor/check/:id', wrap(async (req, res) => {
  const device = db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id);
  if (!device || !device.ip) return res.status(404).json({ error: 'device or ip missing' });
  const result = await ping(device.ip);
  const status = result.alive ? 'up' : 'down';
  db.prepare('INSERT INTO monitor_history (device_id, status, rtt_ms) VALUES (?,?,?)')
    .run(device.id, status, result.rttMs);
  if (result.alive) {
    db.prepare('UPDATE devices SET monitored=1 WHERE id=?').run(device.id);
  }
  res.json({ id: device.id, name: device.name, ip: device.ip, status, rttMs: result.rttMs });
}));

app.post('/api/monitor/check-all', wrap(async (req, res) => {
  const targets = db.prepare('SELECT * FROM devices WHERE monitored=1 OR device_type IN (\'Router\',\'Switch\')').all();
  const results = await Promise.all(targets.map(async (d) => {
    const r = await ping(d.ip);
    const status = r.alive ? 'up' : 'down';
    db.prepare('INSERT INTO monitor_history (device_id, status, rtt_ms) VALUES (?,?,?)')
      .run(d.id, status, r.rttMs);
    return { id: d.id, name: d.name, ip: d.ip, status, rttMs: r.rttMs };
  }));
  res.json(results);
}));

app.get('/api/monitor/status', (req, res) => {
  const rows = db.prepare(`
    SELECT d.id, d.name, d.ip, d.device_type,
      (SELECT status FROM monitor_history m WHERE m.device_id = d.id ORDER BY m.id DESC LIMIT 1) AS last_status,
      (SELECT rtt_ms FROM monitor_history m WHERE m.device_id = d.id ORDER BY m.id DESC LIMIT 1) AS last_rtt,
      (SELECT checked_at FROM monitor_history m WHERE m.device_id = d.id ORDER BY m.id DESC LIMIT 1) AS last_checked
    FROM devices d WHERE d.monitored=1 OR d.device_type IN ('Router','Switch')
    ORDER BY d.name`).all();
  res.json(rows);
});

app.get('/api/monitor/history/:id', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM monitor_history WHERE device_id=? ORDER BY id DESC LIMIT 50')
    .all(req.params.id);
  res.json(rows);
});

app.get('/api/dashboard', (req, res) => {
  res.json({
    counts: {
      rooms: db.prepare('SELECT COUNT(*) c FROM rooms').get().c,
      outlets: db.prepare('SELECT COUNT(*) c FROM outlets').get().c,
      cables: db.prepare('SELECT COUNT(*) c FROM cables').get().c,
      panels: db.prepare('SELECT COUNT(*) c FROM patch_panels').get().c,
      vlans: db.prepare('SELECT COUNT(*) c FROM vlans').get().c,
      devices: db.prepare('SELECT COUNT(*) c FROM devices').get().c,
      cablesActive: db.prepare("SELECT COUNT(*) c FROM cables WHERE status='Active'").get().c,
      cablesFailedTest: db.prepare("SELECT COUNT(*) c FROM cables WHERE test_result='Fail'").get().c,
      openIssues: db.prepare("SELECT COUNT(*) c FROM issues WHERE status IN ('Open','In Progress')").get().c,
      ipConflicts: ipConflicts(db).duplicates.length,
    },
    uptime: (() => {
      const last = db.prepare(`
        SELECT d.name, m.status, m.checked_at
        FROM monitor_history m JOIN devices d ON d.id=m.device_id
        WHERE m.id IN (SELECT MAX(id) FROM monitor_history GROUP BY device_id)`).all();
      const up = last.filter(l => l.status === 'up').length;
      return { total: last.length, up, down: last.length - up, monitored: last };
    })(),
  });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const LAN_IP = process.env.LAN_IP || null;

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    const url = PORT === 80 ? `http://localhost` : `http://localhost:${PORT}`;
    console.log(`Network Management Suite running at ${url}`);
    if (LAN_IP) console.log(`  LAN access: http://${LAN_IP}:${PORT}`);
  });
}

module.exports = app;
