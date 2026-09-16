const express = require('express');
const db = require('../db').pool;
const { ipConflicts } = require('../lib/iputil');
const { setDefaultOrg } = require('../middleware/default-org');

const router = express.Router();

// Use default org for unauthenticated access
router.use(setDefaultOrg);

const MONITORED_TYPES = ['Router', 'Switch'];

router.get('/dashboard', async (req, res) => {
  const orgId = req.user.orgId;
  const count = async (sql, params = []) => (await db.query(sql, params)).rows[0].c;

  const lastResult = await db.query(`
    SELECT d.name, d.ip, d.device_type, m.status, m.rtt_ms, m.checked_at
    FROM devices d
    LEFT JOIN LATERAL (
      SELECT status, rtt_ms, checked_at FROM monitor_history
      WHERE device_id = d.id ORDER BY id DESC LIMIT 1
    ) m ON true
    WHERE (d.monitored = 1 OR d.device_type IN ($1, $2)) AND d.org_id = $3
    ORDER BY d.name`, [...MONITORED_TYPES, orgId]);
  const last = lastResult.rows;
  const up = last.filter((l) => l.status === 'up').length;
  const down = last.filter((l) => l.status === 'down').length;

  const typeResult = await db.query(
    'SELECT device_type, COUNT(*)::int AS n FROM devices WHERE org_id=$1 GROUP BY device_type ORDER BY n DESC, device_type',
    [orgId]);
  const vlanResult = await db.query(`
    SELECT v.vlan_id, v.name, v.subnet, COUNT(d.id)::int AS devices
    FROM vlans v LEFT JOIN devices d ON d.vlan_id = v.id AND d.org_id = $1
    WHERE v.org_id = $1
    GROUP BY v.id, v.vlan_id, v.name, v.subnet
    ORDER BY v.vlan_id`, [orgId]);

  const conflicts = await ipConflicts(db, orgId);

  res.json({
    counts: {
      rooms:            await count('SELECT COUNT(*) AS c FROM rooms WHERE org_id=$1', [orgId]),
      outlets:          await count('SELECT COUNT(*) AS c FROM outlets WHERE org_id=$1', [orgId]),
      cables:           await count('SELECT COUNT(*) AS c FROM cables WHERE org_id=$1', [orgId]),
      panels:           await count('SELECT COUNT(*) AS c FROM patch_panels WHERE org_id=$1', [orgId]),
      vlans:            await count('SELECT COUNT(*) AS c FROM vlans WHERE org_id=$1', [orgId]),
      devices:          await count('SELECT COUNT(*) AS c FROM devices WHERE org_id=$1', [orgId]),
      cablesActive:     await count("SELECT COUNT(*) AS c FROM cables WHERE status='Active' AND org_id=$1", [orgId]),
      cablesFailedTest: await count("SELECT COUNT(*) AS c FROM cables WHERE test_result='Fail' AND org_id=$1", [orgId]),
      openIssues:       await count("SELECT COUNT(*) AS c FROM issues WHERE status IN ('Open','In Progress') AND org_id=$1", [orgId]),
      ipConflicts:      conflicts.duplicates.length,
    },
    deviceTypes: typeResult.rows,
    vlans: vlanResult.rows,
    uptime: { total: last.length, up, down, unknown: last.length - up - down, monitored: last },
  });
});

module.exports = router;
