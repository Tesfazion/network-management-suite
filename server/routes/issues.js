const express = require('express');
const db = require('../db');
const { notFound, badRequest } = require('../lib/errors');
const validation = require('../lib/validation');

const router = express.Router();

const SEVERITIES = ['Low', 'Medium', 'High'];
const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];

const ORDER_BY_STATUS = `
  CASE i.status WHEN 'Open' THEN 0 WHEN 'In Progress' THEN 1 WHEN 'Resolved' THEN 2 ELSE 3 END`;

router.get('/issues', (req, res) => {
  res.json(db.prepare(`
    SELECT i.*, d.name AS device_name, o.label AS outlet_label
    FROM issues i
    LEFT JOIN devices d ON d.id = i.device_id
    LEFT JOIN outlets o ON o.id = i.outlet_id
    ORDER BY ${ORDER_BY_STATUS}, i.created_at DESC`).all());
});

/**
 * Validate and normalize an issue payload.
 * When `current` is provided, missing fields fall back to existing values.
 */
function issueInput(body, current) {
  const fallback = (key, fb) => body[key] === undefined ? (current ? current[key] : fb) : undefined;
  return {
    title: validation.text(body.title ?? (current && current.title), validation.LIMITS.title),
    description: validation.text(fallback('description', null), validation.LIMITS.description),
    severity: validation.oneOf(body.severity, SEVERITIES, current ? current.severity : 'Medium', 'severity'),
    status: validation.oneOf(body.status, STATUSES, current ? current.status : 'Open', 'status'),
    device_id: validation.optionalId(fallback('device_id', null), 'device_id'),
    outlet_id: validation.optionalId(fallback('outlet_id', null), 'outlet_id'),
    reporter: validation.text(fallback('reporter', null), validation.LIMITS.reporter),
  };
}

router.post('/issues', (req, res) => {
  const input = issueInput(req.body, null);
  if (!input.title) throw badRequest('title is required');
  const r = db.prepare(`
    INSERT INTO issues (title, description, severity, status, device_id, outlet_id, reporter)
    VALUES (?,?,?,?,?,?,?)`)
    .run(input.title, input.description || null, input.severity, input.status,
      input.device_id, input.outlet_id, input.reporter || null);
  res.json(db.prepare('SELECT * FROM issues WHERE id=?').get(r.lastInsertRowid));
});

router.patch('/issues/:id', (req, res) => {
  const issue = db.prepare('SELECT * FROM issues WHERE id=?').get(req.params.id);
  if (!issue) throw notFound();
  const input = issueInput(req.body, issue);

  // Auto-stamp resolved_at when status moves to a terminal state.
  const resolvedAt = (input.status === 'Resolved' || input.status === 'Closed')
    ? (issue.resolved_at || new Date().toISOString().slice(0, 19).replace('T', ' '))
    : null;

  db.prepare(`UPDATE issues SET
    title=COALESCE(?,title), description=COALESCE(?,description), severity=COALESCE(?,severity),
    status=?, device_id=COALESCE(?,device_id), outlet_id=COALESCE(?,outlet_id),
    reporter=COALESCE(?,reporter), resolved_at=? WHERE id=?`)
    .run(input.title, input.description, input.severity, input.status,
      input.device_id, input.outlet_id, input.reporter || null, resolvedAt, req.params.id);
  res.json(db.prepare('SELECT * FROM issues WHERE id=?').get(req.params.id));
});

router.delete('/issues/:id', (req, res) => {
  db.prepare('DELETE FROM issues WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;