const express = require('express');
const db = require('../db');
const { ipConflicts } = require('../lib/iputil');

const router = express.Router();

router.get('/dashboard', (req, res) => {
  const count = (sql) => db.prepare(sql).get().c;

  // Latest monitor entry per device (subquery picks the MAX id per device).
  const last = db.prepare(`
    SELECT d.name, m.status, m.checked_at
    FROM monitor_history m JOIN devices d ON d.id=m.device_id
    WHERE m.id IN (SELECT MAX(id) FROM monitor_history GROUP BY device_id)`).all();
  const up = last.filter((l) => l.status === 'up').length;

  res.json({
    counts: {
      rooms: count('SELECT COUNT(*) c FROM rooms'),
      outlets: count('SELECT COUNT(*) c FROM outlets'),
      cables: count('SELECT COUNT(*) c FROM cables'),
      panels: count('SELECT COUNT(*) c FROM patch_panels'),
      vlans: count('SELECT COUNT(*) c FROM vlans'),
      devices: count('SELECT COUNT(*) c FROM devices'),
      cablesActive: count("SELECT COUNT(*) c FROM cables WHERE status='Active'"),
      cablesFailedTest: count("SELECT COUNT(*) c FROM cables WHERE test_result='Fail'"),
      openIssues: count("SELECT COUNT(*) c FROM issues WHERE status IN ('Open','In Progress')"),
      ipConflicts: ipConflicts(db).duplicates.length,
    },
    uptime: { total: last.length, up, down: last.length - up, monitored: last },
  });
});

module.exports = router;