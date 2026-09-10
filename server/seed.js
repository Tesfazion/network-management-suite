const db = require('./db');
const { loadDemo } = require('./seed-data');

async function main() {
  await db.init();
  await loadDemo(db.pool);
  console.log('Seeded sample data successfully.');
  await db.close();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
