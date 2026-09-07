function ipToInt(ip) {
  if (!ip) return null;
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
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
  let mask = parseInt(m[2], 10);
  if (mask < 0 || mask > 32) return null;
  const cidr = mask === 0 ? 0 : (0xffffffff << (32 - mask)) >>> 0;
  return { start: (base & cidr) >>> 0, end: ((base & cidr) | (~cidr >>> 0)) >>> 0 };
}

function inRange(ipInt, range) {
  if (ipInt === null) return false;
  const { start, end } = range;
  return ipInt >= Math.min(start, end) && ipInt <= Math.max(start, end);
}

function ipConflicts(db) {
  const devices = db.prepare('SELECT * FROM devices').all();
  const vlanById = new Map(db.prepare('SELECT * FROM vlans').all().map((v) => [v.id, v]));

  const seen = new Map();
  const duplicates = [];
  for (const d of devices) {
    if (!d.ip) continue;
    if (seen.has(d.ip)) {
      duplicates.push([seen.get(d.ip), d]);
    } else {
      seen.set(d.ip, d);
    }
  }

  const warnings = [];
  for (const d of devices) {
    if (!d.ip) continue;
    const vlan = vlanById.get(d.vlan_id);
    if (!vlan) continue;
    const range = cidrRange(vlan.subnet);
    if (!range) continue;
    if (ipToInt(d.ip) !== null && !inRange(ipToInt(d.ip), range)) {
      warnings.push({ device: d, vlan });
    }
  }

  const gatewayWarnings = [];
  for (const d of devices) {
    if (!d.ip || d.ip === '127.0.0.1') continue;
    if (d.device_type && /router/i.test(d.device_type)) continue;
    const vlan = vlanById.get(d.vlan_id);
    if (!vlan || !vlan.gateway) continue;
    if (d.ip === vlan.gateway) {
      gatewayWarnings.push({ device: d, vlan });
    }
  }

  return { duplicates, warnings, gatewayWarnings };
}

module.exports = { ipConflicts, ipToInt, cidrRange };