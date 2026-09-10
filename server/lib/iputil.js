/**
 * IPv4 utilities: parsing, range math, and conflict detection.
 */
function ipToInt(ip) {
  if (!ip) return null;
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
}

function isValidIpv4(ip) {
  return ipToInt(ip) !== null;
}

function ipFromInt(int) {
  return [
    (int >>> 24) & 255,
    (int >>> 16) & 255,
    (int >>> 8) & 255,
    int & 255,
  ].join('.');
}

function cidrRange(subnet) {
  const m = /^([\d.]+)\/(\d{1,2})$/.exec(subnet || '');
  if (!m) return null;
  const base = ipToInt(m[1]);
  if (base === null) return null;
  const mask = parseInt(m[2], 10);
  if (mask < 0 || mask > 32) return null;
  const cidr = mask === 0 ? 0 : (0xffffffff << (32 - mask)) >>> 0;
  return { start: (base & cidr) >>> 0, end: ((base & cidr) | (~cidr >>> 0)) >>> 0 };
}

function inRange(ipInt, range) {
  if (ipInt === null) return false;
  const { start, end } = range;
  return ipInt >= Math.min(start, end) && ipInt <= Math.max(start, end);
}

function isRouterLike(device) {
  return /router/i.test(device.device_type || '');
}

/**
 * Scan all devices for IP address conflicts:
 * - duplicate IPs across devices
 * - IPs outside their assigned VLAN subnet
 * - non-router devices squatting on a VLAN gateway
 */
async function ipConflicts(db, orgId = null) {
  const deviceQuery = orgId 
    ? await db.query('SELECT * FROM devices WHERE org_id = $1', [orgId])
    : await db.query('SELECT * FROM devices');
  const devices = deviceQuery.rows;
  
  const vlanQuery = orgId
    ? await db.query('SELECT * FROM vlans WHERE org_id = $1', [orgId])
    : await db.query('SELECT * FROM vlans');
  const vlanById = new Map(vlanQuery.rows.map((v) => [v.id, v]));

  const seen = new Map();
  const duplicates = [];
  const warnings = [];
  const gatewayWarnings = [];

  for (const d of devices) {
    if (!d.ip) continue;
    if (seen.has(d.ip)) {
      duplicates.push([seen.get(d.ip), d]);
    } else {
      seen.set(d.ip, d);
    }

    const vlan = vlanById.get(d.vlan_id);
    if (!vlan) continue;
    const range = cidrRange(vlan.subnet);
    if (range && isValidIpv4(d.ip) && !inRange(ipToInt(d.ip), range)) {
      warnings.push({ device: d, vlan });
    }

    if (d.ip !== '127.0.0.1' && !isRouterLike(d) && vlan && vlan.gateway && d.ip === vlan.gateway) {
      gatewayWarnings.push({ device: d, vlan });
    }
  }

  return { duplicates, warnings, gatewayWarnings };
}

module.exports = { ipConflicts, ipToInt, ipFromInt, cidrRange, isValidIpv4 };