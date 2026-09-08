const path = require('path');
const fs = require('fs');

// Load .env file if it exists
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  try {
    require('dotenv').config({ path: envPath });
  } catch (err) {
    console.warn('dotenv not installed, skipping .env file loading');
  }
}

/**
 * Parse an environment variable as a positive integer, with a fallback default.
 */
function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

module.exports = {
  port: intFromEnv('PORT', 8080),
  host: process.env.HOST || '0.0.0.0',
  lanIp: process.env.LAN_IP || null,
  authToken: (process.env.AUTH_TOKEN || '').trim(),
  dbPath: process.env.DATABASE_PATH || path.join(__dirname, '..', 'network.db'),
  publicDir: path.join(__dirname, '..', 'public'),
  bodyLimit: process.env.BODY_LIMIT || '1mb',
  maxSearchQuery: 80,
  pingTimeoutMs: 3000,
};