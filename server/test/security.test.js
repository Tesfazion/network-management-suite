const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Must be set before the app is loaded so config picks them up.
const dbFile = path.join(os.tmpdir(), `nms-auth-test-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = dbFile;
process.env.AUTH_TOKEN = 'test-secret-123';

const app = require('../app');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbFile + suffix); } catch { /* ignore */ }
  }
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