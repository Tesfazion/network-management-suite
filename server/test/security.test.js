const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { Pool } = require('pg');

const dbName = `nms_test_${process.pid}_${Date.now()}`;
process.env.DATABASE_URL = `postgresql://postgres:Bu0987654321%23@localhost:8869/${dbName}`;
process.env.AUTH_TOKEN = 'test-secret-123';

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
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.close();

  const cleanupPool = new Pool({ connectionString: 'postgresql://postgres:Bu0987654321%23@localhost:8869/postgres' });
  await cleanupPool.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  await cleanupPool.end();
});

test('AUTH_TOKEN protects the API with Bearer auth', async () => {
  const noAuth = await fetch(base + '/api/health');
  assert.strictEqual(noAuth.status, 401);
  assert.match(noAuth.headers.get('www-authenticate') || '', /Bearer/);
  assert.strictEqual((await noAuth.json()).error, 'unauthorized');

  const bad = await fetch(base + '/api/health', {
    headers: { Authorization: 'Bearer wrong-token' },
  });
  assert.strictEqual(bad.status, 401);

  const good = await fetch(base + '/api/health', {
    headers: { Authorization: 'Bearer test-secret-123' },
  });
  assert.strictEqual(good.status, 200);
  assert.strictEqual((await good.json()).ok, true);
});

test('public assets stay reachable without a token', async () => {
  const res = await fetch(base + '/');
  assert.strictEqual(res.status, 200);
  assert.ok((await res.text()).includes('<!DOCTYPE html>'));
});
