const config = require('../config');

/**
 * In-memory sliding-window rate limiter keyed by client IP.
 * Enabled when RATE_LIMIT_MAX > 0. Safe for single-process
 * office deployments; scale out with a shared store for clusters.
 */

const hits = new Map();

function rateLimit(req, res, next) {
  if (config.rateLimitMax <= 0) return next();

  const key = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();

  let entry = hits.get(key);
  if (!entry || now - entry.start > config.rateLimitWindowMs) {
    entry = { start: now, count: 0 };
    hits.set(key, entry);
  }

  entry.count += 1;
  if (entry.count > config.rateLimitMax) {
    const retry = Math.ceil((entry.start + config.rateLimitWindowMs - now) / 1000);
    res.setHeader('Retry-After', String(retry));
    return res.status(429).json({ error: 'too many requests' });
  }

  next();
}

// Periodically purge stale entries so the map does not grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hits) {
    if (now - entry.start > config.rateLimitWindowMs) hits.delete(key);
  }
}, 60000).unref();

module.exports = { rateLimit };