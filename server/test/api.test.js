const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { Pool } = require('pg');

const dbName = `nms_test_${process.pid}_${Date.now()}`;
process.env.DATABASE_URL = `postgresql://postgres:Bu0987654321%23@localhost:8869/${dbName}`;

const adminPool = new Pool({ connectionString: 'postgresql://postgres:Bu0987654321%23@localhost:8869/postgres' });

const app = require('../app');

let server;
let base;

before(async () => {
  await adminPool.query(`CREATE DATABASE "${dbName}"`);
  await adminPool.end();

  const db = require('../db');
  await db.init();

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  const db = require('../db');
  await db.close();

  const cleanupPool = new Pool({ connectionString: 'postgresql://postgres:Bu0987654321%23@localhost:8869/postgres' });
  await cleanupPool.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  await cleanupPool.end();
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

test('PATCH rooms, outlets, patch panels and VLANs edits existing records', async () => {
  const { data: room } = await req('POST', '/rooms', { name: 'Edit Room', floor: '1' });
  const { data: rUpdated } = await req('PATCH', `/rooms/${room.id}`, { name: 'Renamed', purpose: 'Lab' });
  assert.strictEqual(rUpdated.name, 'Renamed');
  assert.strictEqual(rUpdated.purpose, 'Lab');
  assert.strictEqual(rUpdated.floor, '1');

  const { data: outlet } = await req('POST', '/outlets', { room_id: room.id, label: 'E-1', location: 'North wall' });
  const { data: oUpdated } = await req('PATCH', `/outlets/${outlet.id}`, { label: 'E-2' });
  assert.strictEqual(oUpdated.label, 'E-2');
  assert.strictEqual(oUpdated.location, 'North wall');

  const { data: panel } = await req('POST', '/patchpanels', { name: 'PP1', ports: 24 });
  const { data: pUpdated } = await req('PATCH', `/patchpanels/${panel.id}`, { ports: 48 });
  assert.strictEqual(pUpdated.ports, 48);

  const { data: vlan } = await req('POST', '/vlans', { vlan_id: 555, name: 'EditVLAN', subnet: '192.168.5.0/24' });
  const { data: vUpdated } = await req('PATCH', `/vlans/${vlan.id}`, { gateway: '192.168.5.1', name: 'RenamedVLAN' });
  assert.strictEqual(vUpdated.gateway, '192.168.5.1');
  assert.strictEqual(vUpdated.name, 'RenamedVLAN');
  assert.strictEqual(vUpdated.vlan_id, 555);
});

test('PATCH cables supports full-field updates', async () => {
  const { data: room } = await req('POST', '/rooms', { name: 'CableRoom' });
  const { data: outlet } = await req('POST', '/outlets', { room_id: room.id, label: 'C-1' });
  const { data: panel } = await req('POST', '/patchpanels', { name: 'CablePP' });
  const { data: cable } = await req('POST', '/cables', {
    cable_id: 'C-1', outlet_id: outlet.id, patch_panel_id: panel.id, test_result: 'Pending',
  });

  const { data: updated } = await req('PATCH', `/cables/${cable.id}`, {
    test_result: 'Pass', status: 'Active', length_m: 22.5, patch_port: '11',
  });
  assert.strictEqual(updated.test_result, 'Pass');
  assert.strictEqual(updated.length_m, 22.5);
  assert.strictEqual(updated.patch_port, '11');
});

test('PATCH devices can clear a nullable VLAN assignment', async () => {
  const { data: vlan } = await req('POST', '/vlans', { vlan_id: 888, name: 'ClearVLAN', subnet: '192.168.8.0/24' });
  const { data: d } = await req('POST', '/devices', { name: 'ClearMe', ip: '192.168.8.10', vlan_id: vlan.id });
  assert.strictEqual(d.vlan_id, vlan.id);

  const { data: cleared } = await req('PATCH', `/devices/${d.id}`, { vlan_id: null });
  assert.strictEqual(cleared.vlan_id, null);
  assert.strictEqual(cleared.name, 'ClearMe');
});

test('PATCH issues can clear a linked device', async () => {
  const { data: issue } = await req('POST', '/issues', { title: 'Link test', status: 'Open' });
  const { data: updated } = await req('PATCH', `/issues/${issue.id}`, { device_id: null });
  assert.strictEqual(updated.device_id, null);
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

test('diagram: empty by default, persists nodes, links and zones', async () => {
  const empty = await fetch(base + '/diagram').then((r) => r.json());
  assert.deepStrictEqual(empty, { nodes: [], links: [], zones: [] });

  const put = await fetch(base + '/diagram', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nodes: [{ id: 'a', type: 'router', label: 'R', x: 10, y: 20, device_id: null, zone: 'z1' }],
      links: [],
      zones: [{ id: 'z1', label: 'Admin Office', x: 0, y: 0, w: 300, h: 200, room_id: null }],
    }),
  });
  assert.strictEqual(put.status, 200);

  const back = await fetch(base + '/diagram').then((r) => r.json());
  assert.strictEqual(back.nodes[0].type, 'router');
  assert.strictEqual(back.nodes[0].x, 10);
  assert.strictEqual(back.nodes[0].zone, 'z1');
  assert.strictEqual(back.zones.length, 1);
  assert.strictEqual(back.zones[0].label, 'Admin Office');
});

test('setup: fresh install is unconfigured, demo seed loads org + diagram zones', async () => {
  const before = await fetch(base + '/setup').then((r) => r.json());
  assert.strictEqual(before.configured, false);

  const setup = await fetch(base + '/setup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ org_name: 'ACME Networks', demo: true }),
  });
  assert.strictEqual(setup.status, 200);
  const s = await setup.json();
  assert.strictEqual(s.org_name, 'ACME Networks');

  const after = await fetch(base + '/setup').then((r) => r.json());
  assert.strictEqual(after.configured, true);
  assert.strictEqual(after.org_name, 'ACME Networks');
  assert.strictEqual(after.demo, true);

  const diagram = await fetch(base + '/diagram').then((r) => r.json());
  assert.ok(diagram.zones.length >= 3, 'demo seed should create office zones');
  assert.ok(diagram.nodes.length >= 8, 'demo seed should create nodes');
});

// ---- Hardening / contract tests --------------------------------------

test('hardening headers are applied to every API response', async () => {
  const res = await fetch(base + '/health');
  assert.ok(res.headers.get('content-security-policy'), 'CSP header present');
  assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(res.headers.get('x-frame-options'), 'DENY');
  assert.strictEqual(res.headers.get('referrer-policy'), 'no-referrer');
  assert.ok(!res.headers.get('x-powered-by'), 'x-powered-by is suppressed');
});

test('/api/health reports liveness', async () => {
  const { status, data } = await req('GET', '/health');
  assert.strictEqual(status, 200);
  assert.strictEqual(data.ok, true);
  assert.ok(data.uptimeSec >= 0);
});

test('unknown API routes return a JSON 404', async () => {
  const res = await fetch(base + '/does-not-exist');
  assert.strictEqual(res.status, 404);
  const data = await res.json();
  assert.strictEqual(data.error, 'not found');
});

test('validation: issues require a title (400)', async () => {
  const { status, data } = await req('POST', '/issues', { severity: 'High' });
  assert.strictEqual(status, 400);
  assert.strictEqual(data.error, 'title is required');
});

test('validation: devices reject malformed IP addresses', async () => {
  const { status, data } = await req('POST', '/devices', { name: 'Bad IP', ip: '999.999.1.1' });
  assert.strictEqual(status, 400);
  assert.match(data.error, /valid IPv4/);
});

test('validation: VLAN subnet must be a valid CIDR', async () => {
  const { status } = await req('POST', '/vlans', { vlan_id: 12, name: 'X', subnet: 'not-a-cidr' });
  assert.strictEqual(status, 400);
});

test('validation: oversized names are truncated, not rejected', async () => {
  const { status, data } = await req('POST', '/rooms', { name: 'R'.repeat(500) });
  assert.strictEqual(status, 200);
  assert.strictEqual(data.name.length, 80);
});
