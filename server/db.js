const Database = require('better-sqlite3');
const path = require('path');

function createDb(location) {
  const dbPath = location || process.env.DATABASE_PATH || path.join(__dirname, '..', 'network.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  floor TEXT,
  purpose TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS outlets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  location TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS patch_panels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT,
  ports INTEGER DEFAULT 24,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cable_id TEXT UNIQUE NOT NULL,
  outlet_id INTEGER REFERENCES outlets(id) ON DELETE SET NULL,
  patch_panel_id INTEGER REFERENCES patch_panels(id) ON DELETE SET NULL,
  patch_port TEXT,
  length_m REAL,
  cable_type TEXT DEFAULT 'Cat6',
  test_result TEXT DEFAULT 'Pending',
  status TEXT DEFAULT 'Active',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vlans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vlan_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  subnet TEXT,
  gateway TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  ip TEXT,
  device_type TEXT,
  vlan_id INTEGER REFERENCES vlans(id),
  mac TEXT,
  location TEXT,
  monitored INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT DEFAULT 'Medium',
  status TEXT DEFAULT 'Open',
  device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  outlet_id INTEGER REFERENCES outlets(id) ON DELETE SET NULL,
  reporter TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS monitor_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  rtt_ms REAL,
  checked_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS diagram (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL DEFAULT '{"nodes":[],"links":[]}',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  org_name TEXT DEFAULT 'Network Management Suite',
  installed_at TEXT DEFAULT (datetime('now'))
);
`);

  return db;
}

module.exports = createDb();
