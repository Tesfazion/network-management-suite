const express = require('express');
const db = require('../db').pool;
const { notFound, badRequest } = require('../lib/errors');
const validation = require('../lib/validation');
const pagination = require('../lib/pagination');

const router = express.Router();

const SEVERITIES = ['Low', 'Medium', 'High'];
const STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];

const ORDER_BY_STATUS = `
  CASE i.status WHEN 'Open' THEN 0 WHEN 'In Progress' THEN 1 WHEN 'Resolved' THEN 2 ELSE 3 END`;

router.get('/issues', async (req, res) => {
  const page = pagination.parse(req.query);
  const { sql, params } = pagination.apply(`
    SELECT i.*, d.name AS device_name, o.label AS outlet_label
    FROM issues i
    LEFT JOIN devices d ON d.id = i.device_id
    LEFT JOIN outlets o ON o.id = i.outlet_id
    ORDER BY ${ORDER_BY_STATUS}, i.created_at DESC`, page);
  const { rows } = await db.query(sql, params);
  res.json(rows);
});

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

router.post('/issues', async (req, res) => {
  const input = issueInput(req.body, null);
  if (!input.title) throw badRequest('title is required');
  const { rows } = await db.query(
    'INSERT INTO issues (title, description, severity, status, device_id, outlet_id, reporter) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [input.title, input.description || null, input.severity, input.status, input.device_id, input.outlet_id, input.reporter || null]);
  res.json(rows[0]);
});

router.patch('/issues/:id', async (req, res) => {
  const issue = await db.query('SELECT * FROM issues WHERE id=$1', [req.params.id]).then(r => r.rows[0]);
  if (!issue) throw notFound();
  const input = issueInput(req.body, issue);

  const deviceId = input.device_id === null ? null : (input.device_id || issue.device_id);
  const outletId = input.outlet_id === null ? null : (input.outlet_id || issue.outlet_id);

  const resolvedAt = (input.status === 'Resolved' || input.status === 'Closed')
    ? (issue.resolved_at || new Date().toISOString().slice(0, 19).replace('T', ' '))
    : null;

  await db.query(
    `UPDATE issues SET title=COALESCE($1,title), description=COALESCE($2,description), severity=COALESCE($3,severity),
     status=$4, device_id=$5, outlet_id=$6,
     reporter=COALESCE($7,reporter), resolved_at=$8 WHERE id=$9`,
    [input.title || null, input.description || null, input.severity, input.status, deviceId, outletId, input.reporter || null, resolvedAt, req.params.id]);
  const { rows } = await db.query('SELECT * FROM issues WHERE id=$1', [req.params.id]);
  res.json(rows[0]);
});

router.delete('/issues/:id', async (req, res) => {
  await db.query('DELETE FROM issues WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
