const express = require('express');
const db = require('../db').pool;
const config = require('../config');
const { badRequest } = require('../lib/errors');
const { setDefaultOrg } = require('../middleware/default-org');
const { collectContext, localReply, summarizeAction, aiSystemPrompt } = require('../lib/assistant');
const aiClient = require('../lib/ai');
const { ping } = require('../lib/monitor');
const logger = require('../lib/logger');

const router = express.Router();

const MESSAGE_LIMIT = 500;
const MONITORED_TYPES = ['Router', 'Switch'];

// Use default org for unauthenticated access
router.use(setDefaultOrg);

function sanitizeHistory(history, max) {
  if (!Array.isArray(history)) return [];
  return history.slice(-max).map((m) => ({
    role: m && m.role === 'assistant' ? 'assistant' : 'user',
    content: String((m && m.content) || '').slice(0, MESSAGE_LIMIT),
  })).filter((m) => m.content);
}

async function runAction(action, orgId) {
  if (!action) return null;

  if (action.type === 'check_all') {
    const { rows } = await db.query(
      'SELECT id, name, ip FROM devices WHERE (monitored = 1 OR device_type IN ($1,$2)) AND org_id = $3',
      [...MONITORED_TYPES, orgId]);
    const devices = [];
    for (const d of rows) {
      if (!d.ip) continue;
      const r = await ping(d.ip);
      const status = r.alive ? 'up' : 'down';
      await db.query('INSERT INTO monitor_history (device_id, status, rtt_ms) VALUES ($1,$2,$3)', [d.id, status, r.rttMs]);
      if (r.alive) await db.query('UPDATE devices SET monitored=1 WHERE id=$1', [d.id]);
      devices.push({ name: d.name, ip: d.ip, status, rttMs: r.rttMs });
    }
    return {
      checked: devices.length,
      up: devices.filter((d) => d.status === 'up').length,
      down: devices.filter((d) => d.status === 'down').length,
      devices,
    };
  }

  if (action.type === 'check_device') {
    const like = `%${action.name}%`;
    const { rows } = await db.query(
      "SELECT id, name, ip FROM devices WHERE (name ILIKE $1 OR ip ILIKE $1) AND org_id=$2 LIMIT 1",
      [like, orgId]);
    if (!rows.length) return { error: `No device matching "${action.name}" was found.` };
    const d = rows[0];
    if (!d.ip) return { error: `${d.name} has no IP address to ping.` };
    const r = await ping(d.ip);
    const status = r.alive ? 'up' : 'down';
    await db.query('INSERT INTO monitor_history (device_id, status, rtt_ms) VALUES ($1,$2,$3)', [d.id, status, r.rttMs]);
    return { name: d.name, ip: d.ip, status, rttMs: r.rttMs };
  }

  if (action.type === 'create_issue') {
    const title = String(action.title || '').trim().slice(0, 120);
    if (!title) return { error: 'incident title is missing' };
    const severity = ['Low', 'Medium', 'High'].includes(action.severity) ? action.severity : 'Medium';
    const { rows } = await db.query(
      "INSERT INTO issues (title, description, severity, status, reporter, org_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [title, null, severity, 'Open', 'Chatbot', orgId]);
    return { id: rows[0].id, title, severity };
  }

  return null;
}

router.post('/chat', async (req, res) => {
  const orgId = req.user.orgId;
  const body = req.body || {};

  const message = String(body.message || '').trim();
  if (!message) throw badRequest('message is required');
  if (message.length > MESSAGE_LIMIT) throw badRequest(`message must be ${MESSAGE_LIMIT} characters or fewer`);

  const history = sanitizeHistory(body.history, config.ai.maxHistory);
  const ctx = await collectContext(db, orgId);

  const local = localReply(message, ctx);
  const actionResult = await runAction(local.action, orgId);
  const actionType = (local.action && local.action.type) || null;

  if (aiClient.isConfigured()) {
    const system = aiSystemPrompt(ctx, local.action, actionResult);
    try {
      const reply = await aiClient.completeChat(system, [...history, { role: 'user', content: message }]);
      return res.json({
        reply,
        ai: true,
        action: actionType,
        actionResult,
      });
    } catch (err) {
      logger.warn(`Chat: AI unavailable, using local assistant (${err.message})`);
    }
  }

  res.json({
    reply: local.reply + summarizeAction(local.action, actionResult),
    ai: false,
    action: actionType,
    actionResult,
  });
});

module.exports = router;