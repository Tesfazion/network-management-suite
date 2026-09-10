const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { Pool } = require('pg');

const dbName = `nms_test_${process.pid}_${Date.now()}`;
process.env.DATABASE_URL = `postgresql://postgres:Bu0987654321%23@localhost:8869/${dbName}`;

const db = require('../db');
const app = require('../app');

let server;
let base;

before(async () => {
  const adminPool = new Pool({ connectionString: 'postgresql://postgres:Bu0987654321%23@localhost:8869/postgres' });
  await adminPool.query(`CREATE DATABASE "${dbName}"`);
  await adminPool.end();

  await db.init();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
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

test('schema migrations ran: version is 2', async () => {
  const { rows } = await db.pool.query('SELECT MAX(version) AS v FROM schema_migrations');
  assert.strictEqual(rows[0].v, 2);
});

test('VLAN DELETE detaches its devices and removes the VLAN', async () => {
  const { data: vlan } = await req('POST', '/vlans', { vlan_id: 901, name: 'ToDelete', subnet: '10.90.1.0/24' });
  const { data: dev } = await req('POST', '/devices', { name: 'VLAN-dev', ip: '10.90.1.5', vlan_id: vlan.id });

  const { status, data } = await req('DELETE', `/vlans/${vlan.id}`);
  assert.strictEqual(status, 200);
  assert.strictEqual(data.detachedDevices, 1);

  const { data: vlans } = await req('GET', '/vlans');
  assert.ok(!vlans.some((v) => v.id === vlan.id), 'VLAN should be gone');

  const { data: devices } = await req('GET', '/devices');
  const after = devices.find((d) => d.id === dev.id);
  assert.strictEqual(after.vlan_id, null, 'device should have VLAN reference cleared');
});

test('VLAN DELETE on a missing VLAN returns 404', async () => {
  const { status } = await req('DELETE', '/vlans/99999');
  assert.strictEqual(status, 404);
});

test('patch panel DELETE nulls cable references', async () => {
  const { data: room } = await req('POST', '/rooms', { name: 'PP-Del Room' });
  const { data: outlet } = await req('POST', '/outlets', { room_id: room.id, label: 'PD-1' });
  const { data: panel } = await req('POST', '/patchpanels', { name: 'PP-Del', ports: 24 });
  await req('POST', '/cables', {
    cable_id: 'PD-1', outlet_id: outlet.id, patch_panel_id: panel.id, patch_port: '1',
  });

  const { status } = await req('DELETE', `/patchpanels/${panel.id}`);
  assert.strictEqual(status, 200);

  const { data: cables } = await req('GET', '/cables');
  const cable = cables.find((c) => c.cable_id === 'PD-1');
  assert.ok(cable, 'cable should survive panel deletion');
  assert.strictEqual(cable.patch_panel_id, null, 'cable panel reference should be nulled');
});

test('pagination: limit/offset applies to room listings only when requested', async () => {
  for (let i = 0; i < 10; i++) {
    await req('POST', '/rooms', { name: `Page Room ${i}` });
  }

  const { data: all } = await req('GET', '/rooms');
  assert.ok(all.length >= 10, 'unpaginated response returns everything');

  const page1 = await fetch(base + '/rooms?limit=4').then((r) => r.json());
  assert.strictEqual(page1.length, 4);

  const page2 = await fetch(base + '/rooms?limit=4&offset=4').then((r) => r.json());
  assert.strictEqual(page2.length, 4);
  assert.notStrictEqual(page1[0].id, page2[0].id, 'offset should move the window');

  const capped = await fetch(base + '/rooms?limit=99999').then((r) => r.json());
  assert.ok(capped.length <= 500, 'limit is capped at 500');
});

test('pagination rejects invalid values gracefully', async () => {
  const res = await fetch(base + '/rooms?limit=abc');
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data), 'invalid limit falls back to unpaginated');
});

test('/api/health verifies database connectivity', async () => {
  const { status, data } = await req('GET', '/health');
  assert.strictEqual(status, 200);
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.db, 'ok');
  assert.strictEqual(data.app, 'network-management-suite');
});
