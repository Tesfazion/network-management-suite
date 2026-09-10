const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  try {
    require('dotenv').config({ path: envPath });
  } catch {
    process.stderr.write('dotenv not installed, skipping .env file loading\n');
  }
}

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

const resolvedPort = intFromEnv('PORT', 8080);
if (!Number.isInteger(resolvedPort) || resolvedPort < 1 || resolvedPort > 65535) {
  throw new Error(`PORT must be an integer between 1 and 65535, got: ${process.env.PORT}`);
}

const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_POSTGRESQL;

module.exports = {
  port: resolvedPort,
  host: process.env.HOST || '0.0.0.0',
  lanIp: process.env.LAN_IP || null,
  authToken: (process.env.AUTH_TOKEN || '').trim(),
  databaseUrl: databaseUrl || null,
  dbPath: process.env.DATABASE_PATH || path.join(__dirname, '..', 'network.db'),
  publicDir: path.join(__dirname, '..', 'public'),
  bodyLimit: process.env.BODY_LIMIT || '1mb',
  maxSearchQuery: 80,
  pingTimeoutMs: 3000,
  rateLimitMax: intFromEnv('RATE_LIMIT_MAX', 300),
  rateLimitWindowMs: intFromEnv('RATE_LIMIT_WINDOW_MS', 900000),
  logFormat: (process.env.LOG_FORMAT || 'text').toLowerCase() === 'json' ? 'json' : 'text',
  corsOrigin: (process.env.CORS_ORIGIN || '').trim() || null,
  maxPageLimit: 500,
  backupDir: process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups'),
  backupKeep: intFromEnv('BACKUP_KEEP', 5),
  
  // Monitoring configuration
  monitoring: {
    enabled: (process.env.MONITORING_ENABLED || 'true').toLowerCase() === 'true',
    checkInterval: intFromEnv('MONITORING_INTERVAL', 60000), // 60 seconds default
    consecutiveFailsRequired: intFromEnv('MONITORING_FAILS_REQUIRED', 3),
  },
  
  // Email alert configuration
  smtp: {
    host: (process.env.SMTP_HOST || '').trim(),
    port: intFromEnv('SMTP_PORT', 587),
    secure: (process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    user: (process.env.SMTP_USER || '').trim(),
    pass: (process.env.SMTP_PASS || '').trim(),
    from: (process.env.SMTP_FROM || '').trim(),
    alertEmail: (process.env.ALERT_EMAIL || '').trim(),
  },
  
  // Webhook configuration
  webhook: {
    url: (process.env.WEBHOOK_URL || '').trim(),
  },
  
  // JWT configuration for authentication
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-this-in-production',
  sessionSecret: process.env.SESSION_SECRET || 'your-session-secret-change-this',
};
