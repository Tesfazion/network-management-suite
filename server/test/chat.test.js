const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { Pool } = require('pg');

require('dotenv').config();

const dbName = `nms_chat_test_${process.pid}_${Date.now()}`;
const testDbUrl = (process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432').replace(/\/[^/]*$/, '');
process.env.DATABASE_URL = `${testDbUrl}/${dbName}`;

const adminPool = new Pool({ connectionString: `${testDbUrl}/postgres` });

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

  const cleanupPool = new Pool({ connectionString: `${testDbUrl}/postgres` });
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

test('chat replies to a greeting in local mode', async () => {
  const { status, data } = await req('POST', '/chat', { message: 'hello' });
  assert.strictEqual(status, 200);
  assert.strictEqual(data.ai, false);
  assert.ok(/assistant/i.test(data.reply));
});

test('chat explains its capabilities', async () => {
  const { status, data } = await req('POST', '/chat', { message: 'what can you do?' });
  assert.strictEqual(status, 200);
  assert.ok(/NetVisor Suite/i.test(data.reply));
  assert.ok(/devices/i.test(data.reply));
});

test('chat reports an empty inventory honestly', async () => {
  const { status, data } = await req('POST', '/chat', { message: 'show devices' });
  assert.strictEqual(status, 200);
  assert.ok(/No devices/i.test(data.reply));
});

test('chat creates an incident from a log command', async () => {
  const { status, data } = await req('POST', '/chat', { message: 'log incident: coffee machine offline severity high' });
  assert.strictEqual(status, 200);
  assert.strictEqual(data.action, 'create_issue');
  assert.ok(/created incident #\d+/i.test(data.reply));
  assert.ok(/High/i.test(data.reply));

  const { data: issues } = await req('GET', '/issues');
  assert.ok(issues.some((i) => i.title === 'coffee machine offline' && i.severity === 'High'));
});

test('chat creates an incident without needing a colon separator', async () => {
  const { status, data } = await req('POST', '/chat', { message: 'create issue wifi down severity high' });
  assert.strictEqual(status, 200);
  assert.strictEqual(data.action, 'create_issue');
  assert.strictEqual(data.actionResult.title, 'wifi down');
  assert.strictEqual(data.actionResult.severity, 'High');
});

test('chat reads existing incidents instead of creating one for "open incidents"', async () => {
  const { status, data } = await req('POST', '/chat', { message: 'open incidents' });
  assert.strictEqual(status, 200);
  assert.strictEqual(data.action, null);
  assert.ok(/incident/i.test(data.reply));
});

test('chat accepts prior conversation history', async () => {
  const { status, data } = await req('POST', '/chat', {
    message: 'and which VLANs?',
    history: [{ role: 'user', content: 'list vlans' }, { role: 'assistant', content: 'here are the vlans' }],
  });
  assert.strictEqual(status, 200);
  assert.ok(data.reply.length > 0);
});

test('chat rejects an empty message', async () => {
  const { status } = await req('POST', '/chat', { message: '   ' });
  assert.strictEqual(status, 400);
});