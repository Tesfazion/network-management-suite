const db = require('../server/db');
const { loadDemo } = require('../server/seed-data');

const orgArg = process.argv.find((a) => a.startsWith('--org='));
const org = (orgArg ? orgArg.split('=')[1] : '').trim() || 'Network Management Suite';
const demo = process.argv.includes('--demo');

db.prepare(`INSERT INTO settings (id, org_name, installed_at) VALUES (1, ?, datetime('now'))
  ON CONFLICT(id) DO UPDATE SET org_name=excluded.org_name`).run(org);

if (demo) loadDemo(db);

console.log('Organization configured: ' + org);
console.log(demo ? 'Demonstration data loaded.' : 'Database left as-is.');