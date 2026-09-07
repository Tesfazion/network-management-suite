const express = require('express');
const path = require('path');
const db = require('./db');
const { ping } = require('./monitor');

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

app.post('/api/devices', (req, res) => {
  const { name, ip, device_type, vlan_id, mac, location, monitored } = req.body;
  const r = db.prepare('INSERT INTO devices (name, ip, device_type, vlan_id, mac, location, monitored) VALUES (?,?,?,?,?,?,?)')
    .run(name, ip, device_type, vlan_id, mac, location, monitored ? 1 : 0);
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
    .run(name, ip, device_type, vlan_id, mac, location, monitored, req.params.id);
  res.json(db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id));
});

app.delete('/api/devices/:id', (req, res) => {
  db.prepare('DELETE FROM devices WHERE id=?').run(req.params.id);
  res.json({ ok: true });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Network Management Suite running at http://localhost:${PORT}`);
});
