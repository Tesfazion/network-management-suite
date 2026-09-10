const { Pool } = require('pg');

(async () => {
  const passwords = [
    '', 'postgres', 'admin', 'password', '123456', 'postgres123', 'P@ssw0rd',
    'postgres1', 'postgres!', 'pg', 'pgsql', 'local', 'test', 'pass', '1234',
    '12345', '12345678', 'qwerty', 'abc123', 'monkey', 'master', 'dragon',
    'login', 'welcome', 'guest', 'default', 'root', 'toor', 'letmein',
    'passw0rd', 'p@ssword', 'PostgreSQL', 'postgre', 'psql', 'enterprise',
    'install', 'setup', 'config', 'server', 'database', 'db', 'data'
  ];
  for (const pw of passwords) {
    try {
      const pool = new Pool({
        host: 'localhost',
        port: 8869,
        user: 'postgres',
        password: pw,
        database: 'postgres',
        connectionTimeoutMillis: 2000,
      });
      await pool.query('SELECT 1');
      console.log('Password "' + pw + '" works!');
      process.exit(0);
    } catch (err) {
      // ignore
    }
  }
  console.log('None worked');
  process.exit(1);
})();
