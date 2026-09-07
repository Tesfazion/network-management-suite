const { badRequest } = require('./errors');
const { isValidIpv4, cidrRange } = require('./iputil');

/** Shared length limits (characters). */
const LIMITS = {
  name: 80,
  label: 80,
  title: 140,
  location: 120,
  notes: 500,
  description: 2000,
  mac: 32,
  subnet: 64,
  orgName: 120,
  reporter: 80,
};

/**
 * Trim a value to a string and cap its length.
 * Returns '' for null/undefined.
 */
function text(value, max = 120) {
  const s = value === null || value === undefined ? '' : String(value);
  const t = s.trim();
  return t.length > max ? t.slice(0, max) : t;
}

/**
 * Require a non-empty trimmed string within a length limit.
 * @throws {Error} 400 when the value is blank.
 */
function textRequired(value, max, label) {
  const s = text(value, max);
  if (!s) throw badRequest(`${label} is required`);
  return s;
}

function optionalNum(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function optionalInt(value) {
  const n = optionalNum(value);
  return n !== null && Number.isInteger(n) ? n : null;
}

/**
 * Parse an optional positive ID from a request field.
 * @param {*} value - Raw value from req.body.
 * @param {string} label - Field name used in error messages.
 * @returns {number|null} Parsed positive integer, or null when omitted.
 * @throws {Error} 400 when the value is present but invalid.
 */
function optionalId(value, label) {
  const n = optionalInt(value);
  if (n === null) return null; // explicitly omitted
  if (n < 1) throw badRequest(`${label} must be a positive id`);
  return n;
}

function requiredId(value, label) {
  const n = optionalId(value, label);
  if (n === null) throw badRequest(`${label} is required`);
  return n;
}

/** Normalize a monitoring flag; only true-ish values enable it. */
function boolFlag(value) {
  return value === true || value === 1 || value === '1' ? 1 : 0;
}

/**
 * Validate that a value is one of the allowed options.
 * Returns `fallback` when the value is blank.
 */
function oneOf(value, allowed, fallback, label) {
  const s = text(value, 40);
  if (!s) return fallback;
  if (!allowed.includes(s)) throw badRequest(`${label} must be one of: ${allowed.join(', ')}`);
  return s;
}

/**
 * Validate an optional IPv4 address.
 * @param {*} value - Raw value from req.body.
 * @param {string} [label='ip'] - Field name for error messages.
 * @returns {string|null}
 */
function optionalIp(value, label = 'ip') {
  const s = text(value, 64);
  if (!s) return null;
  if (!isValidIpv4(s)) throw badRequest(`${label} must be a valid IPv4 address`);
  return s;
}

/**
 * Validate an optional CIDR subnet string.
 * @param {*} value - Raw value from req.body.
 * @returns {string|null}
 */
function optionalSubnet(value) {
  const s = text(value, LIMITS.subnet);
  if (!s) return null;
  if (!cidrRange(s)) throw badRequest('subnet must be a valid CIDR, e.g. 192.168.10.0/24');
  return s;
}

module.exports = {
  LIMITS, text, textRequired, optionalNum, optionalInt,
  optionalId, requiredId, boolFlag, oneOf, optionalIp, optionalSubnet,
};