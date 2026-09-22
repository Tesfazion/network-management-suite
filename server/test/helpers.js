const dotenv = require('dotenv');
dotenv.config();

// Derive the Postgres *server* URL (no database path) that tests create/drop
// temporary databases on. Priority: TEST_DATABASE_URL (CI) -> .env DATABASE_URL
// -> a conventional local default. Used so tests never hardcode credentials.
function dbServerBase() {
  const raw = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432';
  const u = new URL(raw);
  u.pathname = '';
  u.search = '';
  u.hash = '';
  return u.toString().replace(/\/$/, '');
}

module.exports = { dbServerBase };