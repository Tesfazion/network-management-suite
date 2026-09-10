const express = require('express');
const db = require('../db').pool;
const { ipConflicts } = require('../lib/iputil');

const router = express.Router();

const MONITORED_TYPES = ['Router', 'Switch'];

router.get('/dashboard', async (req, res) => {
  const count = async (sql) => (await db.query(sql)).rows[0].c;

  const lastResult = await db.query(`
    SELECT d.name, d.ip, d.device_type, m.status, m.rtt_ms, m.checked_at
    FROM devices d
    LEFT JOIN LATERAL (
      SELECT status, rtt_ms, checked_at FROM monitor_history
      WHERE device_id = d.id ORDER BY id DESC LIMIT 1
    ) m ON true
    WHERE d.monitored = 1 OR d.device_type IN ($1, $2)
    ORDER BY d.name`, MONITORED_TYPES);
  const last = lastResult.rows;
  const up = last.filter((l) => l.status === 'up').length;
  const down = last.filter((l) => l.status === 'down').length;

  const typeResult = await db.query(
    'SELECT device_type, COUNT(*)::int AS n FROM devices GROUP BY device_type ORDER BY n DESC, device_type');
  const vlanResult = await db.query(`
    SELECT v.vlan_id, v.name, v.subnet, COUNT(d.id)::int AS devices
    FROM vlans v LEFT JOIN devices d ON d.vlan_id = v.id
    GROUP BY v.id, v.vlan_id, v.name, v.subnet
    ORDER BY v.vlan_id`);

  const conflicts = await ipConflicts(db);

  res.json({
    counts: {
      rooms: await count('SELECT COUNT(*) AS c FROM rooms'),
      outlets: await count('SELECT COUNT(*) AS c FROM outlets'),
      cables: await count('SELECT COUNT(*) AS c FROM cables'),
      panels: await count('SELECT COUNT(*) AS c FROM patch_panels'),
      vlans: await count('SELECT COUNT(*) AS c FROM vlans'),
      devices: await count('SELECT COUNT(*) AS c FROM devices'),
      cablesActive: await count("SELECT COUNT(*) AS c FROM cables WHERE status='Active'"),
      cablesFailedTest: await count("SELECT COUNT(*) AS c FROM cables WHERE test_result='Fail'"),
      openIssues: await count("SELECT COUNT(*) AS c FROM issues WHERE status IN ('Open','In Progress')"),
      ipConflicts: conflicts.duplicates.length,
    },
    deviceTypes: typeResult.rows,
    vlans: vlanResult.rows,
    uptime: { total: last.length, up, down, unknown: last.length - up - down, monitored: last },
  });
});

module.exports = router;
