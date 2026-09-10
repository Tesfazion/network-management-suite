/**
 * Network Management Suite - database backup utility.
 *
 * For PostgreSQL, uses `pg_dump` to create a SQL dump and prunes old backups.
 *
 * Usage:
 *   npm run backup
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../server/config');

const backupDir = config.backupDir;
fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = path.join(backupDir, `network-${stamp}.sql`);

function pgDumpArgs() {
  const url = new URL(config.databaseUrl);
  return [
    '-h', url.hostname,
    '-p', url.port || '5432',
    '-U', url.username,
    '-d', url.pathname.slice(1),
    '-f', target,
    '--format=plain',
    '--no-owner',
    '--no-acl',
  ];
}

const password = new URL(config.databaseUrl).password;

console.log(`Creating backup of ${config.databaseUrl} ...`);

const dump = execFile('pg_dump', pgDumpArgs(), { env: { ...process.env, PGPASSWORD: password } });

dump.on('close', (code) => {
  if (code !== 0) {
    console.error(`pg_dump exited with code ${code}`);
    process.exit(1);
  }
  console.log(`Backup written: ${target}`);

  const keep = config.backupKeep;
  const backups = fs.readdirSync(backupDir)
    .filter((f) => /^network-.*\.sql$/.test(f))
    .sort()
    .reverse();

  for (const old of backups.slice(keep)) {
    fs.unlinkSync(path.join(backupDir, old));
    console.log(`Pruned old backup: ${old}`);
  }

  console.log('Backup complete.');
});

dump.on('error', (err) => {
  console.error('Backup failed:', err.message);
  process.exit(1);
});
