const { Pool } = require('pg');
const config = require('./config');
const logger = require('./lib/logger');

const pool = new Pool({
  connectionString: config.databaseUrl || undefined,
  host: config.databaseUrl ? undefined : (process.env.PG_HOST || 'localhost'),
  port: config.databaseUrl ? undefined : Number(process.env.PG_PORT || 5432),
  user: config.databaseUrl ? undefined : (process.env.PG_USER || 'postgres'),
  password: config.databaseUrl ? undefined : (process.env.PG_PASSWORD || ''),
  database: config.databaseUrl ? undefined : (process.env.PG_DATABASE || 'postgres'),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function ensureSchema() {
  await pool.query(`
CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  floor TEXT,
  purpose TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS outlets (
  id SERIAL PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  location TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patch_panels (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  ports INTEGER DEFAULT 24,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cables (
  id SERIAL PRIMARY KEY,
  cable_id TEXT UNIQUE NOT NULL,
  outlet_id INTEGER REFERENCES outlets(id) ON DELETE SET NULL,
  patch_panel_id INTEGER REFERENCES patch_panels(id) ON DELETE SET NULL,
  patch_port TEXT,
  length_m REAL,
  cable_type TEXT DEFAULT 'Cat6',
  test_result TEXT DEFAULT 'Pending',
  status TEXT DEFAULT 'Active',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vlans (
  id SERIAL PRIMARY KEY,
  vlan_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  subnet TEXT,
  gateway TEXT,
  description TEXT
);

CREATE TABLE IF NOT EXISTS devices (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  ip TEXT,
  device_type TEXT,
  vlan_id INTEGER REFERENCES vlans(id),
  mac TEXT,
  location TEXT,
  monitored INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS issues (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT DEFAULT 'Medium',
  status TEXT DEFAULT 'Open',
  device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  outlet_id INTEGER REFERENCES outlets(id) ON DELETE SET NULL,
  reporter TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS monitor_history (
  id SERIAL PRIMARY KEY,
  device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  rtt_ms REAL,
  checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS diagram (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL DEFAULT '{"nodes":[],"links":[],"zones":[]}',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  org_name TEXT DEFAULT 'Network Management Suite',
  installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`);
}

const MIGRATIONS = [
  {
    version: 2,
    name: 'add performance indexes',
    sql: `
CREATE INDEX IF NOT EXISTS idx_monitor_history_device ON monitor_history(device_id);
CREATE INDEX IF NOT EXISTS idx_cables_outlet ON cables(outlet_id);
CREATE INDEX IF NOT EXISTS idx_devices_vlan ON devices(vlan_id);
CREATE INDEX IF NOT EXISTS idx_devices_monitored ON devices(monitored);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
    `,
  },
  {
    version: 3,
    name: 'add alert system tables',
    sql: `
-- Alert log for audit trail
CREATE TABLE IF NOT EXISTS alert_log (
  id SERIAL PRIMARY KEY,
  device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  alert_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add last_status and last_checked columns to devices if not exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='devices' AND column_name='last_status') THEN
    ALTER TABLE devices ADD COLUMN last_status TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='devices' AND column_name='last_checked') THEN
    ALTER TABLE devices ADD COLUMN last_checked TIMESTAMP;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='devices' AND column_name='last_rtt') THEN
    ALTER TABLE devices ADD COLUMN last_rtt REAL;
  END IF;
END $$;

-- Index for alert log queries
CREATE INDEX IF NOT EXISTS idx_alert_log_device ON alert_log(device_id);
CREATE INDEX IF NOT EXISTS idx_alert_log_created ON alert_log(created_at);
    `,
  },
  {
    version: 4,
    name: 'add multi-tenancy and authentication',
    sql: `
-- Organizations table (multi-tenancy)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  subscription_tier TEXT DEFAULT 'free',
  subscription_status TEXT DEFAULT 'active',
  max_devices INTEGER DEFAULT 10,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  email_verified BOOLEAN DEFAULT false,
  verification_token TEXT,
  reset_token TEXT,
  reset_token_expires TIMESTAMP,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Organization members (junction table for users and orgs)
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  invited_by UUID REFERENCES users(id),
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, user_id)
);

-- API keys for programmatic access
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  last_used TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMP NOT NULL
);

-- Add org_id to existing tables for multi-tenancy
DO $$ 
BEGIN
  -- Add org_id to all existing tables
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='rooms' AND column_name='org_id') THEN
    ALTER TABLE rooms ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='outlets' AND column_name='org_id') THEN
    ALTER TABLE outlets ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='patch_panels' AND column_name='org_id') THEN
    ALTER TABLE patch_panels ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cables' AND column_name='org_id') THEN
    ALTER TABLE cables ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vlans' AND column_name='org_id') THEN
    ALTER TABLE vlans ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='devices' AND column_name='org_id') THEN
    ALTER TABLE devices ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='issues' AND column_name='org_id') THEN
    ALTER TABLE issues ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diagram' AND column_name='org_id') THEN
    ALTER TABLE diagram ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='alert_log' AND column_name='org_id') THEN
    ALTER TABLE alert_log ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Indexes for multi-tenancy
CREATE INDEX IF NOT EXISTS idx_rooms_org ON rooms(org_id);
CREATE INDEX IF NOT EXISTS idx_outlets_org ON outlets(org_id);
CREATE INDEX IF NOT EXISTS idx_patch_panels_org ON patch_panels(org_id);
CREATE INDEX IF NOT EXISTS idx_cables_org ON cables(org_id);
CREATE INDEX IF NOT EXISTS idx_vlans_org ON vlans(org_id);
CREATE INDEX IF NOT EXISTS idx_devices_org ON devices(org_id);
CREATE INDEX IF NOT EXISTS idx_issues_org ON issues(org_id);
CREATE INDEX IF NOT EXISTS idx_alert_log_org ON alert_log(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);

-- Insert default organization for existing data
INSERT INTO organizations (id, name, slug, subscription_tier, max_devices)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization', 'default', 'enterprise', 999999)
ON CONFLICT DO NOTHING;

-- Assign existing data to default organization
UPDATE rooms SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE outlets SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE patch_panels SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE cables SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE vlans SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE devices SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE issues SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE alert_log SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
    `,
  },
];

async function migrate() {
  const currentResult = await pool.query('SELECT MAX(version) AS v FROM schema_migrations');
  const currentVersion = currentResult.rows[0] && currentResult.rows[0].v ? currentResult.rows[0].v : 0;

  for (const m of MIGRATIONS) {
    if (m.version <= currentVersion) continue;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(m.sql);
      await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [m.version, m.name]);
      await client.query('COMMIT');
      logger.info(`Database migrated to schema v${m.version} (${m.name})`);
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(`Migration v${m.version} (${m.name}) failed`, { error: err.message });
      throw err;
    } finally {
      client.release();
    }
  }
}

async function init() {
  await ensureSchema();
  await migrate();
  return pool;
}

async function closePool() {
  await pool.end();
}

module.exports = {
  init,
  close: closePool,
  pool,
  query: (text, params) => pool.query(text, params),
};
