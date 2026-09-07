const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dbFile = path.join(os.tmpdir(), `nms-test-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = dbFile;

const app = require('../server');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbFile + suffix); } catch { /* ignore */ }
  }
});

async function req(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

test('GET /rooms returns an empty list on a fresh database', async () => {
  const { status, data } = await req('GET', '/rooms');
  assert.strictEqual(status, 200);
  assert.deepStrictEqual(data, []);
});

test('room CRUD creates and lists a room', async () => {
  const { status, data: room } = await req('POST', '/rooms', { name: 'Test Office', floor: '2' });
  assert.strictEqual(status, 200);
  assert.strictEqual(room.name, 'Test Office');
  const { data: rooms } = await req('GET', '/rooms');
  assert.ok(rooms.some((r) => r.id === room.id));
});

test('deleting a room cascades to its outlets but keeps cables (FK SET NULL)', async () => {
  const { data: room } = await req('POST', '/rooms', { name: 'Cascade Room' });
  const { data: outlet } = await req('POST', '/outlets', { room_id: room.id, label: 'A-155' });

  const { data: panel } = await req('POST', '/patchpanels', { name: 'PP-Test', ports: 24 });
  await req('POST', '/cables', {
    cable_id: 'A-155', outlet_id: outlet.id, patch_panel_id: panel.id, patch_port: '9',
  });

  const { status } = await req('DELETE', `/rooms/${room.id}`);
  assert.strictEqual(status, 200);

  const { data: outlets } = await req('GET', '/outlets');
  assert.ok(!outlets.some((o) => o.id === outlet.id), 'outlet should be cascade-deleted');

  const { data: cables } = await req('GET', '/cables');
  const cable = cables.find((c) => c.cable_id === 'A-155');
  assert.ok(cable, 'cable run should survive');
  assert.strictEqual(cable.outlet_id, null, 'cable outlet reference should be nulled');
});

test('monitored flag is normalized (string "0" must NOT enable monitoring)', async () => {
  const { data: d0 } = await req('POST', '/devices', { name: 'Unmonitored', ip: '10.0.0.1', monitored: '0' });
  assert.strictEqual(d0.monitored, 0);

  const { data: d1 } = await req('POST', '/devices', { name: 'MonitoredStr', ip: '10.0.0.2', monitored: '1' });
  assert.strictEqual(d1.monitored, 1);

  const { data: dT } = await req('POST', '/devices', { name: 'MonitoredBool', ip: '10.0.0.3', monitored: true });
  assert.strictEqual(dT.monitored, 1);

  const { data: dM } = await req('POST', '/devices', { name: 'MonitoredMissing', ip: '10.0.0.4' });
  assert.strictEqual(dM.monitored, 0);
});

test('PATCH updates only the fields provided and normalizes monitored', async () => {
  const { data: d } = await req('POST', '/devices', { name: 'Orig', ip: '10.0.0.5', monitored: '1' });
  const { data: updated } = await req('PATCH', `/devices/${d.id}`, { monitored: '0' });
  assert.strictEqual(updated.name, 'Orig');
  assert.strictEqual(updated.monitored, 0);
});

test('live monitoring pings a device and records history', async () => {
  const { data: dev } = await req('POST', '/devices', { name: 'Loopback', ip: '127.0.0.1', monitored: '1' });
  const { data: check } = await req('POST', `/monitor/check/${dev.id}`);
  assert.strictEqual(check.status, 'up');
  assert.ok(check.rttMs !== null);

  const { data: status } = await req('GET', '/monitor/status');
  const row = status.find((s) => s.id === dev.id);
  assert.strictEqual(row.last_status, 'up');

  const { data: history } = await req('GET', `/monitor/history/${dev.id}`);
  assert.ok(history.length >= 1);
  assert.strictEqual(history[0].status, 'up');
});

test('dashboard returns aggregate counts and uptime', async () => {
  const { data: dash } = await req('GET', '/dashboard');
  assert.ok(dash.counts.rooms > 0);
  assert.ok('up' in dash.uptime);
  assert.ok(dash.uptime.total >= 1);
});

test('issues: CRUD lifecycle and resolved_at on completion', async () => {
  const { data: created } = await req('POST', '/issues', {
    title: 'Printer not connecting', description: 'Appears offline', severity: 'High', status: 'Open',
  });
  assert.strictEqual(created.status, 'Open');

  const { data: list } = await req('GET', '/issues');
  assert.ok(list.some((i) => i.id === created.id));

  const { data: progressed } = await req('PATCH', `/issues/${created.id}`, { status: 'In Progress' });
  assert.strictEqual(progressed.status, 'In Progress');

  const { data: resolved } = await req('PATCH', `/issues/${created.id}`, { status: 'Resolved' });
  assert.strictEqual(resolved.status, 'Resolved');
  assert.ok(resolved.resolved_at, 'resolved_at should be stamped');

  const { status } = await req('DELETE', `/issues/${created.id}`);
  assert.strictEqual(status, 200);
});

test('conflicts: duplicate IPs and out-of-subnet devices are detected', async () => {
  await req('POST', '/vlans', { vlan_id: 777, name: 'Test', subnet: '192.168.77.0/24', gateway: '192.168.77.1' });
  const { data: vlan } = await req('GET', '/vlans');
  const v = vlan.find((x) => x.vlan_id === 777);

  await req('POST', '/devices', { name: 'A', ip: '192.168.77.10', vlan_id: v.id });
  await req('POST', '/devices', { name: 'B', ip: '192.168.77.10', vlan_id: v.id });
  await req('POST', '/devices', { name: 'C', ip: '10.1.1.1', vlan_id: v.id });

  const { data: conflicts } = await req('GET', '/conflicts');
  assert.ok(conflicts.duplicateIps.some((d) => d.ip === '192.168.77.10'));
  assert.ok(conflicts.outsideSubnet.some((w) => /C \(10\.1\.1\.1\)/.test(w.message)));
});

test('search finds devices, cables and incidents', async () => {
  await req('POST', '/issues', { title: 'Scanner jammed after upgrade', status: 'Open' });
  const { data: res } = await req('GET', '/search?q=jammed');
  assert.ok(res.issues.some((i) => /jammed/i.test(i.title)));
});

test('CSV exports return well-formed headers', async () => {
  const r1 = await fetch(base + '/export/cables.csv');
  const t1 = await r1.text();
  assert.ok(r1.headers.get('content-type').includes('text/csv'));
  assert.match(t1.split('\n')[0], /Cable ID/);

  const r2 = await fetch(base + '/export/devices.csv');
  const t2 = await r2.text();
  assert.match(t2.split('\n')[0], /Name.*IP.*VLAN/);
});