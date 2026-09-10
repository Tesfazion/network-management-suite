const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { Pool } = require('pg');

const dbName = `nms_test_${process.pid}_${Date.now()}`;
process.env.DATABASE_URL = `postgresql://postgres:Bu0987654321%23@localhost:8869/${dbName}`;
process.env.RATE_LIMIT_MAX = '3';
process.env.RATE_LIMIT_WINDOW_MS = '60000';

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

test('rate limiter returns 429 after the configured burst is exceeded', async () => {
  for (let i = 0; i < 3; i++) {
    const res = await fetch(base + '/health');
    assert.strictEqual(res.status, 200);
  }

  const blocked = await fetch(base + '/health');
  assert.strictEqual(blocked.status, 429);
  assert.strictEqual((await blocked.json()).error, 'too many requests');
  assert.ok(blocked.headers.get('retry-after'), 'Retry-After header present');
});

test('static assets are not rate limited', async () => {
  const state = await fetch(base.replace('/api', '') + '/');
  assert.strictEqual(state.status, 200);
});
