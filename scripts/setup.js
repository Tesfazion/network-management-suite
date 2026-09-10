const db = require('../server/db');
const { loadDemo } = require('../server/seed-data');

const orgArg = process.argv.find((a) => a.startsWith('--org='));
const org = (orgArg ? orgArg.split('=')[1] : '').trim() || 'Network Management Suite';
const demo = process.argv.includes('--demo');

async function main() {
  await db.init();
  await db.pool.query('INSERT INTO settings (id, org_name, installed_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (id) DO UPDATE SET org_name=excluded.org_name', [1, org]);
  if (demo) await loadDemo(db.pool);
  console.log('Organization configured: ' + org);
  console.log(demo ? 'Demonstration data loaded.' : 'Database left as-is.');
  await db.close();
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
