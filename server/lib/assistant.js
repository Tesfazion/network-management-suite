/**
 * Local support assistant for NetVisor Suite.
 *
 * Rule/intent based: understands how-to questions about the app and returns
 * live answers from the database. Runs fully offline. When an optional AI
 * model is configured (see server/lib/ai.js) the chat route upgrades these
 * replies while still executing local actions.
 */

const { ipConflicts } = require('./iputil');

const MONITORED_TYPES = ['Router', 'Switch'];

async function collectContext(db, orgId) {
  const [roomRow, outletRow, panelRow, cableRow, vlanRow, deviceRow, issueRow, diagramRow, orgRow, failedCableRow] = await Promise.all([
    db.query('SELECT COUNT(*)::int AS c FROM rooms WHERE org_id=$1', [orgId]),
    db.query('SELECT COUNT(*)::int AS c FROM outlets WHERE org_id=$1', [orgId]),
    db.query('SELECT COUNT(*)::int AS c FROM patch_panels WHERE org_id=$1', [orgId]),
    db.query('SELECT COUNT(*)::int AS c FROM cables WHERE org_id=$1', [orgId]),
    db.query(
      'SELECT v.vlan_id, v.name, v.subnet, v.gateway, COUNT(d.id)::int AS devices FROM vlans v ' +
      'LEFT JOIN devices d ON d.vlan_id = v.id AND d.org_id = $1 WHERE v.org_id = $1 ' +
      'GROUP BY v.id, v.vlan_id, v.name, v.subnet, v.gateway ORDER BY v.vlan_id',
      [orgId]),
    db.query(
      'SELECT d.id, d.name, d.ip, d.device_type, d.monitored, v.name AS vlan_name, v.vlan_id AS vlan_number ' +
      'FROM devices d LEFT JOIN vlans v ON v.id = d.vlan_id WHERE d.org_id = $1 ORDER BY d.name',
      [orgId]),
    db.query(
      "SELECT i.id, i.title, i.severity, d.name AS device_name FROM issues i " +
      "LEFT JOIN devices d ON d.id = i.device_id WHERE i.org_id = $1 AND i.status IN ('Open','In Progress') " +
      'ORDER BY i.created_at DESC LIMIT 8',
      [orgId]),
    db.query('SELECT data FROM diagram WHERE id=$1 AND org_id=$2', [1, orgId]),
    db.query('SELECT org_name FROM settings WHERE id=$1', [1]),
    db.query(
      "SELECT c.cable_id, r.name AS room_name FROM cables c " +
      "LEFT JOIN outlets o ON o.id = c.outlet_id LEFT JOIN rooms r ON r.id = o.room_id " +
      "WHERE c.org_id=$1 AND c.test_result = 'Fail' ORDER BY c.cable_id LIMIT 8",
      [orgId]),
  ]);

  const cablesFailed = failedCableRow.rows;

  let diagram;
  try {
    diagram = diagramRow.rows[0] ? JSON.parse(diagramRow.rows[0].data) : { nodes: [], links: [], zones: [] };
  } catch {
    diagram = { nodes: [], links: [], zones: [] };
  }
  if (!diagram || typeof diagram !== 'object') diagram = { nodes: [], links: [], zones: [] };

  const monitorRows = await db.query(
    `SELECT d.name, d.ip, d.device_type,
      (SELECT status FROM monitor_history m WHERE m.device_id = d.id ORDER BY m.id DESC LIMIT 1) AS status,
      (SELECT rtt_ms FROM monitor_history m WHERE m.device_id = d.id ORDER BY m.id DESC LIMIT 1) AS rtt_ms
     FROM devices d
     WHERE (d.monitored = 1 OR d.device_type IN ($1,$2)) AND d.org_id = $3 ORDER BY d.name`,
    [...MONITORED_TYPES, orgId]);

  const conflicts = await ipConflicts(db, orgId);

  return {
    orgName: (orgRow.rows[0] && orgRow.rows[0].org_name) || 'your network',
    counts: {
      rooms: roomRow.rows[0].c,
      outlets: outletRow.rows[0].c,
      panels: panelRow.rows[0].c,
      cables: cableRow.rows[0].c,
      vlans: vlanRow.rows.length,
      devices: deviceRow.rows.length,
      openIssues: issueRow.rows.length,
    },
    devices: deviceRow.rows,
    vlans: vlanRow.rows,
    monitor: monitorRows.rows,
    openIssues: issueRow.rows,
    cablesFailed,
    conflicts,
    diagram: {
      nodes: (diagram.nodes || []).length,
      links: (diagram.links || []).length,
      zones: (diagram.zones || []).length,
    },
  };
}

function bullets(items, max, decorate) {
  const list = Array.isArray(items) ? items : [];
  const visible = max && list.length > max ? list.slice(0, max) : list;
  const out = visible.map((it, i) => `  • ${decorate ? decorate(it, i) : it}`);
  if (list.length > visible.length) out.push(`  … and ${list.length - visible.length} more`);
  return out.join('\n');
}

function countsLine(ctx) {
  const c = ctx.counts;
  return `This network (${ctx.orgName}) has: ${c.rooms} room(s) · ${c.outlets} wall outlet(s) · ` +
    `${c.panels} patch panel(s) · ${c.cables} cable run(s) · ${c.vlans} VLAN(s) · ` +
    `${c.devices} network device(s) · ${c.openIssues} open incident(s).`;
}

function fmtDevice(d) {
  const proc = [d.device_type, d.monitored ? 'monitored' : null].filter(Boolean).join(' · ');
  return `${d.name} — ${d.ip || 'no IP'}${proc ? ` (${proc})` : ''}`;
}

function healthReply(ctx) {
  const m = ctx.monitor;
  const up = m.filter((x) => x.status === 'up').length;
  const down = m.filter((x) => x.status === 'down').length;
  const unknown = m.length - up - down;
  const lines = [`Network health for ${ctx.orgName}: ${up} up, ${down} down` +
    `${unknown ? `, ${unknown} not checked yet` : ''}.`];
  const downDevices = m.filter((x) => x.status === 'down');
  if (downDevices.length) {
    lines.push('Down or unreachable:');
    lines.push(bullets(downDevices, 10, (d) => `${d.name} — ${d.ip || 'no IP'}`));
  } else if (ctx.counts.devices > 0) {
    lines.push('No monitored device is currently down.');
  }
  if (ctx.counts.devices === 0) {
    lines.push('Add devices in Infrastructure → Devices to start monitoring. (Health is based on the most recent check of each monitored Router/Switch.)');
  } else if (!ctx.monitor.length) {
    lines.push('No monitored devices yet — mark a Router/Switch as monitored in Infrastructure → Devices, or say "check all devices".');
  }
  const open = ctx.openIssues.length;
  if (open) lines.push(`${open} open incident(s) — see "open incidents" for details.`);
  const dup = ctx.conflicts.duplicates.length;
  if (dup) lines.push(`⚠ ${dup} duplicate IP conflict(s) detected — see "ip conflicts".`);
  return lines.join('\n');
}

function devicesReply(ctx) {
  const list = ctx.devices;
  if (!list.length) {
    return 'No devices are saved yet. Add hardware in Infrastructure → Devices (top right, "+ Add device"), or load demo data in Setup.';
  }
  return `${ctx.orgName} · ${list.length} device(s):\n${bullets(list, 14, fmtDevice)}`;
}

function vlansReply(ctx) {
  const list = ctx.vlans;
  if (!list.length) return 'No VLANs exist yet. Create one under IP & VLAN → VLANs.';
  const lines = [`${ctx.vlans.length} VLAN(s):`, bullets(list, 14, (v) => {
    const net = [v.subnet, v.gateway ? `gw ${v.gateway}` : null].filter(Boolean).join(' · ');
    return `VLAN ${v.vlan_id} ${v.name} — ${net}${v.devices ? ` · ${v.devices} device(s)` : ''}`;
  })];
  return lines.join('\n');
}

function infrastructureReply(ctx) {
  return countsLine(ctx);
}

function conflictsReply(ctx) {
  const { duplicates, warnings, gatewayWarnings } = ctx.conflicts;
  const lines = [];
  if (!duplicates.length && !warnings.length && !gatewayWarnings.length) {
    lines.push('No IP conflicts found across devices and VLANs.');
  } else {
    lines.push(`IP scan for ${ctx.orgName}:`);
    if (duplicates.length) {
      lines.push(`Duplicate IPs (${duplicates.length}):`);
      lines.push(bullets(duplicates, 8, ([a, b]) => `${a.ip} used by ${a.name} and ${b.name}`));
    }
    if (warnings.length) {
      lines.push(`Outside VLAN subnet (${warnings.length}):`);
      lines.push(bullets(warnings, 8, (w) => `${w.device.name} (${w.device.ip}) not in VLAN ${w.vlan.vlan_id} ${w.vlan.name}`));
    }
    if (gatewayWarnings.length) {
      lines.push(`Gateway squatting (${gatewayWarnings.length}):`);
      lines.push(bullets(gatewayWarnings, 8, (w) => `${w.device.name} uses gateway IP of VLAN ${w.vlan.vlan_id} ${w.vlan.name}`));
    }
  }
  lines.push('You can see the full list in IP & VLAN → Conflicts.');
  return lines.join('\n');
}

function incidentsReply(ctx) {
  const list = ctx.openIssues;
  if (!list.length) return 'No open incidents. Nice!';
  const lines = [`${list.length} open incident(s):`, bullets(list, 8, (i) => {
    const dev = i.device_name ? ` · ${i.device_name}` : '';
    return `${i.title} [${i.severity}]${dev}`;
  })];
  lines.push('Manage them in the Issues tab.');
  return lines.join('\n');
}

function cablesReply(ctx) {
  const c = ctx.counts;
  if (!c.cables) return 'No cable runs recorded yet. Add them in Infrastructure → Cabling.';
  const lines = [`${c.cables} cable run(s) in ${ctx.orgName}.`];
  const failed = ctx.cablesFailed;
  if (failed && failed.length) {
    lines.push('\nFailed the latest cable test:');
    lines.push(bullets(failed, 8, (c) => `${c.cable_id}${c.room_name ? ` (${c.room_name})` : ''}`));
  }
  return lines.join('\n');
}

function diagramReply(ctx) {
  const d = ctx.diagram;
  return `The Diagram tab has ${d.nodes} node(s), ${d.links} link(s) across ${d.zones} site(s). ` +
    'Open 🗺️ Network Diagram to edit it, or say "how do I connect devices" for steps.';
}

const HOW_TO_DIAGRAM = `To put your network on the Diagram:
1. Open 🗺️ Network Diagram from the left menu.
2. Add nodes: click a type in the palette then click the canvas — or press "Import inventory" to auto-place your real devices and wire them to a core.
3. Pick a Link type (Copper / Fiber / Wireless / Console / Serial), then press Connect and click two nodes — connect mode stays armed so you can chain more links (click a blank area or press Esc to stop).
4. Click a link to select it: press Delete to remove it, or change its type with the Link dropdown.
5. Editing auto-saves; you can also press Save diagram.
For a quick test, try Trace mode (pick two nodes) or load demo data in Setup.`;

const HOW_TO_CONNECT = `To connect devices (e.g. a switch to a router):
1. Make sure both devices exist — in Infrastructure → Devices, or by adding nodes on the Diagram.
2. Recommended: open 🗺️ Network Diagram and use "Import inventory" to place them automatically.
3. Choose the right Link type — Copper (patch), Fiber, Wireless, Console, Serial.
4. Click Connect, then click the first device and then the second device to draw the link. Connect mode stays armed so you can keep chaining links.
5. Click a link to select it — you can change its type or press Delete to remove it.`;

const HOW_TO_ADD_DEVICE = `To add a device:
1. Open Infrastructure → Devices and press "+ Add device".
2. Fill in the name, type (Router, Switch, Server, Printer, etc.), IP, and choose a room and VLAN.
3. Save — the device appears in Devices, the Network Diagram (after import), and can be monitored.
You can also add nodes straight on the Diagram: pick a type in the palette and click the canvas.`;

const HOW_TO_MONITOR = `To monitor a device:
1. Open Infrastructure → Devices and find the device.
2. Check the "Monitored" box (or edit the device) — Router/Switch types are periodically pinged even without the box.
3. The Monitoring tab shows live status and history; the app can alert on repeated failures.
Say "check all devices" right now to run a check, or "check <device name>" for one.`;

const HOW_TO_TEST_CABLE = `To test a cable run:
1. Open Infrastructure → Cabling — each run lists its outlet and patch panel port.
2. From Device List > Cables you can run a cable test; results (PASS / FAIL) are stored per run.
Just ask me "cables" and I'll show the summary.`;

const HOW_TO_EXPORT = `To export data, use the Export button in the top bar of the app — it gives you CSV downloads for cable runs and devices.`;

const CAPABILITIES = `I can help you run NetVisor Suite. Try asking:

• How-to’s — "how do I connect devices?", "how do I add a device?", "what is monitoring?"
• Live data — "show devices", "list VLANs", "network health"
• Find things — "find the router", "any IP conflicts?"
• Health actions — "check all devices", "check core switch"
• Issues — "log incident: WiFi down on floor 2", "open incidents"
• Diagram help — "how do I make a diagram?", "topology"
• Cables & rooms — "cables", "rooms"

Shortcuts: devices · health · vlans · conflicts · incidents · cables · rooms · diagram · monitoring · export · help`;

function stripDeviceWord(name) {
  return String(name || '').replace(/^(?:the\s+)?(?:device|host|node|router|switch|server|printer|workstation|ap|access point)\s+/i, ' ').trim();
}

function findDeviceReply(q, ctx) {
  const clean = stripDeviceWord(q)
    .replace(/^(?:is|the)\s+/i, '')
    .replace(/\s+(?:have|has|do|does|is|what)\s*$/i, '')
    .trim();
  if (!clean) {
    return 'What are you looking for? Try "find the printer", "what ip does the router have", or "devices".';
  }
  const ql = clean.toLowerCase();
  const hit = ctx.devices.find((d) =>
    (d.name && d.name.toLowerCase().includes(ql)) ||
    (d.ip && d.ip.indexOf(ql) >= 0) ||
    (d.device_type && d.device_type.toLowerCase() === ql));
  if (hit) {
    const room = hit.room_name ? ` in ${hit.room_name}` : '';
    return `${hit.name}${room}: ${hit.ip || 'no IP'} · ${hit.device_type}${hit.monitored ? ' · monitored' : ''}${hit.vlan_name ? ` · VLAN ${hit.vlan_number} ${hit.vlan_name}` : ''}.`;
  }
  const fuzzy = ctx.devices.filter((d) =>
    (d.name && d.name.toLowerCase().includes(ql.slice(0, 3))) ||
    (d.device_type && d.device_type.toLowerCase().includes(ql.slice(0, 3))));
  if (fuzzy.length) return `No exact match for "${clean}". Closest:\n${bullets(fuzzy, 5, fmtDevice)}`;
  return `I couldn't find ${clean} in this network. Try "show devices" to list everything.`;
}

const JOKES = [
  'Why did the router go to therapy? It had too many route destinations.',
  'I asked the switch to make a decision, but it kept forwarding the question.',
  "A packet walks into a bar: \"I'll have a beer.\" The barman says, \"Sorry, you're not routed here.\"",
  'Why do network admins never get cold? They are surrounded by firewalls.',
];

const INTENTS = [
  // ---- Actions ----
  {
    match: /^(?:log|create|add|file|report|new|open)\s+(?:an?\s+)?(?:incident|issue|ticket|problem|case)s?\b\s*[:-]?\s*(.+)$/i,
    run: (m) => {
      const raw = String(m[1] || '').trim();
      if (!raw) return null;
      const sev = /severity\s*(low|medium|high)/i.exec(raw);
      const severity = sev ? sev[1].charAt(0).toUpperCase() + sev[1].slice(1) : 'Medium';
      const title = raw
        .replace(/\s*severity\s*(low|medium|high)\s*/i, ' ')
        .replace(/^(?:about|regarding|with|for)\s+/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!title) return null;
      return { reply: `Creating incident "${title}" (${severity}).`, action: { type: 'create_issue', title, severity } };
    },
  },
  // ---- Cabling topics (before the generic "check <name>" so "test cables" stays useful) ----
  {
    match: /\b(?:test|certify|verify|measure)\b.*\b(?:cable|run|link)\b|\bcable\s+(?:test|fail|pass|ok|good|bad|status)\b/i,
    run: () => ({ reply: HOW_TO_TEST_CABLE }),
  },
  {
    match: /\bcables?\b|cable runs|patching|patch panel|punch.?down/i,
    run: (_m, ctx) => ({ reply: cablesReply(ctx) }),
  },
  // ---- Check all devices ----
  {
    match: /\b(?:check|verify|scan|test|ping)\s+(?:all|everything|devices|monitoring|health|network)\b|^check$|run checks?|ping (?:all|everything)|do (?:a )?check\b/i,
    run: () => ({ reply: 'On it — I will ping every monitored Router/Switch now.', action: { type: 'check_all' } }),
  },
  // ---- Is a specific device alive / monitored? ----
  {
    match: /\b(?:is|are)\s+(?:the\s+)?(?:router|switch|server|printer|node|device|host|nas|workstation|access point|ap)\s+(?:monitored|up|down|online|offline|working|reachable|alive|available)\b|\b(?:is|are) it (?:monitored|up|down|online|offline|working|reachable|alive|available)\b|\bping it\b/i,
    run: (_m, ctx) => ({ reply: `${healthReply(ctx)}\n\n${HOW_TO_MONITOR}` }),
  },
  // ---- Generic check/ping a single device/node by name or IP ----
  {
    match: /\b(?:check|ping|scan|test)\s+(?:the\s+)?(.+)$/i,
    run: (m) => {
      const lookup = stripDeviceWord(m[1]);
      if (lookup.length > 2) {
        return { reply: `Checking "${lookup}" now.`, action: { type: 'check_device', name: lookup } };
      }
      return { reply: 'What would you like me to check? Try "check all devices" or "check <device name>".' };
    },
  },
  // ---- Greetings / pleasantries ----
  {
    match: /^(?:hi+\b|hello\b|hey+\b|howdy|yo|greetings|hiya|sup\b|whats up|what's up|good (?:morning|afternoon|evening)|goodday)/i,
    run: (_m, ctx) => ({ reply: `Hello! I'm ${ctx.orgName}'s assistant. Ask me anything — try "What can you do?" or "show devices".` }),
  },
  {
    match: /\b(?:thanks|thank you|thx|ty|cheers|appreciate[ds]? it|much appreciated)\b$/i,
    run: () => ({ reply: 'You’re welcome! Anything else you’d like to know?' }),
  },
  {
    match: /^(?:ok\s+)?(?:bye|goodbye|see (?:ya|you)|cya|later|quit|exit|gtg)$/i,
    run: () => ({ reply: 'Bye! The assistant is always here if you get stuck.' }),
  },
  {
    match: /\bwho are you\b|\bwhat(?:'s| is) your name\b|\bintroduce yourself\b|\bwho is this\b/i,
    run: (_m, ctx) => ({ reply: `I'm the assistant for ${ctx.orgName} — a friendly guide for NetVisor Suite. I can answer how-to questions and pull live data about your network. Say "help" to see what I can do.` }),
  },
  {
    match: /\bhow are you\b|\bhow(?:'s| is) it going\b|\bhow do you do\b/i,
    run: () => ({ reply: 'Running great, thanks for asking! How can I help with your network today?' }),
  },
  {
    match: /\b(?:what|current|today'?s)?\s*(?:time|date|day)\b|\bwhat time is it\b|\bwhat day is it\b/i,
    run: () => ({ reply: `It's ${new Date().toLocaleString()} (server time).` }),
  },
  {
    match: /\bjoke\b|something funny|make me laugh/i,
    run: () => ({ reply: JOKES[(Math.random() * JOKES.length) | 0] }),
  },
  // ---- Help / capabilities ----
  {
    match: /\bwhat can you do\b|\bwhat do you know\b|\bhelp\b|commands|capabilit|your (features|options|abilities)|^menu$|what are you (able|programmed) to/i,
    run: () => ({ reply: CAPABILITIES }),
  },
  // ---- How-to intents ----
  {
    match: /(how (do|to|can|should|would) i?.*connect|connect\s+(devices|two|them|my|the|nodes|things)|wire\s+(?:up\s+)?(?:the\s+)?(them|devices|nodes|servers?)|link (nodes|devices|two)|make (a |the )?connection|patch (the )?(devices|cable|two))/i,
    run: () => ({ reply: HOW_TO_CONNECT }),
  },
  {
    match: /\b(network )?diagram\b|topology|map (of )?(my |the )?network|visual|\bgraph\b/i,
    run: (_m, ctx) => ({ reply: `${diagramReply(ctx)}\n\n${HOW_TO_DIAGRAM}` }),
  },
  {
    match: /\bsimulat|\btrac(?:e|ing)\b|demo mode|test (the )?(connection|path)|connectivity between|is (it|that) reachable/i,
    run: () => ({ reply: 'To trace a path on the Diagram: open 🗺️ Network Diagram, press Trace / Demo mode, then click any two nodes — the app simulates the connection and shows hops. In demo mode you can click two nodes directly to trace.' }),
  },
  {
    match: /\b(add|create|make|set up|install)\s+(?:a |an |the )?(?:new |second |another |extra )?(?:device|node|router|switch|server|printer|host|workstation|nas|access point|ap)\b/i,
    run: () => ({ reply: HOW_TO_ADD_DEVICE }),
  },
  {
    match: /\b(monitor|monitoring)\b|enable monitoring|add.*to monitoring|watch .*device/i,
    run: (_m, ctx) => ({ reply: `${healthReply(ctx)}\n\n${HOW_TO_MONITOR}` }),
  },
  {
    match: /import.*(inventory|diagram)|auto.?wire|auto.?layout|import from (infrastructure|devices)/i,
    run: () => ({ reply: 'In the Diagram tab, press "Import inventory" — it pulls devices from Infrastructure, places them, and offers to auto-wire them. It merges with your current diagram (you get a confirm) rather than wiping it.' }),
  },
  {
    match: /\bexport\b|csv|download.*data|backup data/i,
    run: () => ({ reply: HOW_TO_EXPORT }),
  },
  {
    match: /report a problem|where.*report|how.*report/i,
    run: () => ({ reply: 'You can log an incident in the Issues tab, or just tell me: "log incident: <what happened>". I can file it for you.' }),
  },
  // ---- Live data lookups ----
  {
    match: /\bwhat(?:'s| is)?(?: the)? (?:ip|ip address)(?: of| for| is| does| do| has| have)?\s+(?:the\s+)?(.+)$/i,
    run: (m, ctx) => {
      const q = String(m[1] || '').replace(/\s+(?:have|has|do|does|is|what)$/i, '').replace(/^(?:the|my|our)\s+/i, '').trim().toLowerCase();
      if (!q) return { reply: 'Which device? Try "what ip does the router have" or "what is the ip of the printer".' };
      const hit = ctx.devices.find((d) =>
        (d.name && d.name.toLowerCase() === q) ||
        (d.device_type && d.device_type.toLowerCase() === q) ||
        (d.name && d.name.toLowerCase().includes(q)));
      if (hit) {
        return { reply: `${hit.name} uses ${hit.ip || 'no IP'}${hit.vlan_name ? ` (VLAN ${hit.vlan_number} ${hit.vlan_name})` : ''}.` };
      }
      return { reply: `I couldn't find a device matching "${q}". Say "show devices" to list everything.` };
    },
  },
  {
    match: /\b(find|search\s*(?:for)?|locate|where\s+(?:is|'s)|\bip\s+of|address of)\s+(?:the\s+|for\s+)?(.+)$/i,
    run: (m, ctx) => ({ reply: findDeviceReply(m[2], ctx) }),
  },
  {
    match: /(?:open|any|active|current|recent|all|my|show|list)?\s*(?:incidents?|issues?|tickets?)\b|problems logged|support (queue|tickets)|any (problems|trouble|issues)/i,
    run: (_m, ctx) => ({ reply: incidentsReply(ctx) }),
  },
  {
    match: /\bhealth\b|status|offline|\bdown\b|\bup\b|online|availability|everything (ok|okay|fine|running)|is everything (ok|fine)|how.{0,40}network/i,
    run: (_m, ctx) => ({ reply: healthReply(ctx) }),
  },
  {
    match: /\bconflict|duplicate (ip|address)|ip.*(clash|dispute|same)/i,
    run: (_m, ctx) => ({ reply: conflictsReply(ctx) }),
  },
  {
    match: /\bvlan|subnet|ip (pool|range|plan)|dhcp|gateways?\b/i,
    run: (_m, ctx) => ({ reply: vlansReply(ctx) }),
  },
  {
    match: /(?:^|\b)(?:show|list|catalog)(?: me)?(?: all)?(?: (?:my|our|the))?(?: network)? (?:devices?|inventory|hosts|machines|equipment|nodes)\b|how many (?:devices?|hosts|machines|nodes)\b|(?:all|my|the|current)\s+(?:devices?|inventory|hosts|machines|nodes)\b|\bdevices?\b|\binventory\b|\bhosts\b|\bmachines\b|\b(?:equipment|nodes)\b/i,
    run: (_m, ctx) => ({ reply: devicesReply(ctx) }),
  },
  {
    match: /\broom(?:s)?\b|floor|infrastructure|site|building/i,
    run: (_m, ctx) => ({ reply: infrastructureReply(ctx) }),
  },
  {
    match: /^\bping\b$/i,
    run: (_m, ctx) => ({ reply: healthReply(ctx) }),
  },
];

function localReply(message, ctx) {
  // Strip trailing punctuation so "thanks!" behaves like "thanks".
  const hay = String(message).replace(/[!.,?]+$/, '').trim() || String(message);
  for (const intent of INTENTS) {
    const m = intent.match.exec(hay);
    if (!m) continue;
    const out = intent.run(m, ctx);
    if (out) return out;
  }
  return {
    reply: `I'm not sure how to answer that yet. Try asking about the app or your network — e.g. "show devices", "network health", or "how do I connect devices?". Say "help" for everything I can do.`,
  };
}

function summarizeAction(action, result) {
  if (!action || !result) return '';
  if (action.type === 'check_all') {
    const downList = (result.devices || []).filter((d) => d.status === 'down');
    const line = `Checked ${result.checked} device(s) — ${result.up} up, ${result.down} down.`;
    if (downList.length) {
      return `\n\n${line}\nDown:\n${bullets(downList, 8, (d) => `${d.name} — ${d.ip || ''}`)}`;
    }
    return `\n\n${line} All good.`;
  }
  if (action.type === 'check_device') {
    if (result.error) return `\n\n${result.error}`;
    return `\n\n${result.name} (${result.ip}) is ${result.status === 'up' ? 'up' : 'down'}` +
      `${result.rttMs != null ? ` · ${result.rttMs} ms` : ''}.`;
  }
  if (action.type === 'create_issue') {
    if (result.error) return `\n\nCould not create the incident: ${result.error}`;
    return `\n\nCreated incident #${result.id} "${result.title}" [${result.severity}]. It is now listed in the Issues tab.`;
  }
  return '';
}

function aiSystemPrompt(ctx, action, actionResult) {
  const header = [
    `You are the support assistant for NetVisor Suite, a network management web app for "${ctx.orgName}".`,
    'Answer in plain text, be friendly, concise and accurate. Use simple numbered steps for how-tos.',
    'Ground answers in the live data below; do not invent devices, IPs or numbers.',
  ].join('\n');

  const data = [
    `Current counts: ${ctx.counts.rooms} rooms, ${ctx.counts.outlets} outlets, ${ctx.counts.panels} patch panels, ${ctx.counts.cables} cables, ${ctx.counts.vlans} VLANs, ${ctx.counts.devices} devices, ${ctx.counts.openIssues} open incidents.`,
    `Devices: ${ctx.devices.map((d) => `${d.name} (${d.ip || 'no IP'}, ${d.device_type}${d.monitored ? ', monitored' : ''})`).join('; ') || 'none'}`,
    `VLANs: ${ctx.vlans.map((v) => `VLAN ${v.vlan_id} ${v.name} ${v.subnet || ''}${v.gateway ? ` gw ${v.gateway}` : ''} (${v.devices} device(s))`).join('; ') || 'none'}`,
    `Monitoring: ${ctx.monitor.map((x) => `${x.name}=${x.status || 'unchecked'}`).join(', ') || 'no monitored devices'}`,
    `Open incidents: ${ctx.openIssues.map((i) => i.title).join('; ') || 'none'}`,
    `IP conflicts: ${ctx.conflicts.duplicates.length} duplicate, ${ctx.conflicts.warnings.length} outside subnet, ${ctx.conflicts.gatewayWarnings.length} gateway clashes.`,
    `Diagram: ${ctx.diagram.nodes} nodes, ${ctx.diagram.links} links, ${ctx.diagram.zones} zones.`,
  ].join('\n');

  const actionNote = action
    ? `\nThe requested action just ran. Result: ${JSON.stringify(actionResult)}. Mention the outcome naturally (e.g. checked N devices, X up).`
    : '';

  return `${header}\n\nLIVE DATA:\n${data}\n\nFeatures you can explain: Network Diagram (import inventory, connect mode two-click links, trace), Infrastructure (rooms/outlets/patch panels/cables), IP & VLAN (vlans, conflicts), Monitoring (ping checks), Issues, Dashboard, CSV export, Setup templates.\n${actionNote}\nKeep replies under ~200 words. Use "•" or "1." bullets for lists.`;
}

module.exports = { collectContext, localReply, summarizeAction, aiSystemPrompt };