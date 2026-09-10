/**
 * Network Management Suite — client-side application.
 * Single-file vanilla JS SPA with hash-based routing, modal CRUD,
 * live monitoring, search, and an SVG diagram editor.
 */

// ---- Utilities -------------------------------------------------------

/** Query a single element by CSS selector. */
const $ = (sel) => document.querySelector(sel);

/**
 * Create a DOM element with optional class and text/content.
 * @param {string} tag - HTML tag name.
 * @param {string} [cls] - Space-separated CSS classes.
 * @param {string|Element} [txt] - Text content or child element.
 * @returns {Element}
 */
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt !== undefined) {
    if (txt instanceof Element) n.append(txt);
    else n.textContent = txt;
  }
  return n;
};

/**
 * Call the JSON API and return parsed data.
 * Throws on non-2xx responses so callers can show a toast.
 *
 * @param {string} path - API path (e.g. '/api/v1/rooms').
 * @param {object} [opts] - fetch options.
 * @returns {Promise<any>}
 */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    ...opts,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error || msg; } catch { /* ignore */ }
    const e = new Error(msg);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

/**
 * Show a transient notification toast.
 * @param {string} message - Text to display.
 * @param {'ok'|'err'|'warn'} [type='ok'] - Visual variant.
 */
function toast(message, type = 'ok') {
  const t = el('div', 'toast ' + type);
  t.append(el('span', '', type === 'ok' ? '✓' : type === 'err' ? '✕' : '!'), el('span', '', message));
  $('#toasts').append(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2600);
  setTimeout(() => t.remove(), 3000);
}

/**
 * Format an ISO-like datetime string for display.
 * @param {string} s - Raw datetime from the API.
 * @returns {string}
 */
const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z'));
  if (isNaN(d)) return s;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

/**
 * Format an ISO-like datetime string with time for display.
 * @param {string} s - Raw datetime from the API.
 * @returns {string}
 */
const fmtTime = (s) => {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z'));
  if (isNaN(d)) return s;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const pill = (kind, label) => el('span', 'pill ' + kind, label);

/**
 * Render an empty table row with a span across all columns.
 * @param {number} colspan
 * @param {string} message
 * @returns {HTMLTableRowElement}
 */
const emptyRow = (colspan, message) => {
  const tr = el('tr', 'empty-row');
  const td = el('td', '', message);
  td.colSpan = colspan;
  tr.append(td);
  return tr;
};

// ---------- Tabs / navigation ----------

/** Name of the currently visible tab. */
let currentTab = 'dashboard';

/**
 * Switch to a named tab and refresh its content.
 * @param {'dashboard'|'infrastructure'|'ipvlan'|'monitoring'|'incidents'|'diagram'} name
 */
function goTab(name) {
  currentTab = name;
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.tab === name));
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  $('#' + name).classList.add('active');
  $('#searchResults').hidden = true;
  if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
  loadTab(name);
}

$('#nav').addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item');
  if (item) goTab(item.dataset.tab);
});
$('#content').addEventListener('click', (e) => {
  const link = e.target.closest('[data-goto]');
  if (link) goTab(link.dataset.goto);
});

/**
 * Dispatch tab content loading with error handling.
 * @param {string} name
 */
function loadTab(name) {
  const loaders = {
    dashboard: loadDashboard,
    infrastructure: loadInfrastructure,
    ipvlan: loadIpVlan,
    monitoring: loadMonitoring,
    incidents: loadIncidents,
    diagram: loadDiagram,
  };
  const loader = loaders[name];
  if (!loader) return;
  loader().catch((e) => {
    console.error('Error loading tab:', name, e);
    toast((e && e.message) || 'Failed to load data', 'err');
  });
}

// ---------- Dashboard ----------

/** Small stroke-icon set used on the dashboard KPI tiles. Single-path definitions. */
const ICON_PATHS = {
  devices: ['M6 3h12v18H6z', 'M9 7h6', 'M9 12h6', 'M9 17h4'],
  online: ['M5 12a7 7 0 0 1 14 0', 'M8.5 12a3.5 3.5 0 0 1 7 0', 'M12 19v.01'],
  cables: ['M9 2v3M15 2v3M7 5h10v3a5 5 0 0 1-5 5 5 5 0 0 1-5-5z', 'M12 13v7', 'M8 20h8'],
  incidents: ['M10.3 3.8 2.5 15.9A2 2 0 0 0 4.2 19h15.6a2 2 0 0 0 1.7-3.1L13.7 3.8a2 2 0 0 0-3.4 0z', 'M12 9v4', 'M12 17h.01'],
  conflicts: ['M8 7h10M15 9.5 17.5 7 15 4.5', 'M16 17H6M9 14.5 6.5 17 9 19.5'],
  failed: ['M12 2.5 20 5v6c0 4.6-3.4 8.6-8 9.5-4.6-.9-8-4.9-8-9.5V5z', 'M9.5 9.5l5 5', 'M14.5 9.5l-5 5'],
};

/**
 * Build a 24x24 stroke-based SVG icon element from a named path set.
 * @param {string} name - Key into {@link ICON_PATHS}.
 * @returns {SVGSVGElement}
 */
function ico(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  (ICON_PATHS[name] || []).forEach((d) => {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  });
  return svg;
}

/**
 * Build a horizontal meter bar filled to the given percentage.
 * Shared by the KPI tiles, device-type, and VLAN panels (DRY).
 * @param {number} width - Fill width 0-100.
 * @param {string} [cls] - Meter element class.
 * @returns {HTMLElement}
 */
function meterFill(width, cls = 'meter') {
  const meter = el('div', cls);
  const fill = el('i');
  fill.style.width = Math.min(Math.max(width || 0, 0), 100) + '%';
  meter.append(fill);
  return meter;
}

/**
 * Run a dashboard sub-render in isolation so one malformed panel
 * never blanks the whole overview (reliability).
 * @param {() => void} fn - Panel renderer.
 * @param {string} label - Panel name for diagnostics.
 */
function dashPanel(fn, label) {
  try { fn(); }
  catch (e) { console.error(`Dashboard panel error (${label}):`, e); }
}

/**
 * Fetch dashboard aggregates, conflict alerts, uptime, and recent issues,
 * then render the overview: health chip, KPI tiles, availability donut,
 * device/VLAN breakdowns, recent incidents, and live reachability.
 */
async function loadDashboard() {
  const [d, conflicts, issues] = await Promise.all([
    api('/api/v1/dashboard'),
    api('/api/v1/conflicts'),
    api('/api/v1/issues'),
  ]);

  $('#dashUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString();

  const badge = $('#openIssueBadge');
  if (d.counts.openIssues > 0) { badge.textContent = d.counts.openIssues; badge.hidden = false; }
  else badge.hidden = true;

  dashPanel(() => renderHealth(d), 'health');
  dashPanel(() => renderKpis(d), 'kpis');
  dashPanel(() => renderDonut(d), 'availability');
  dashPanel(() => renderTypes(d), 'device types');
  dashPanel(() => renderVlans(d), 'vlans');
  dashPanel(() => renderIssues(issues), 'incidents');
  dashPanel(() => renderReach(d), 'reachability');

  dashPanel(() => { $('#dashConflicts').replaceChildren(...conflictsBlock(conflicts)); }, 'conflicts');
}

/**
 * Render the status chip in the dashboard hero based on device + incident health.
 * @param {object} d - Dashboard payload.
 */
function renderHealth(d) {
  const chip = $('#dashHealth');
  const u = d.uptime;
  let cls, label;
  if (u.down > 0) {
    cls = 'health-bad';
    label = u.down + (u.down === 1 ? ' device offline' : ' devices offline');
  } else if (d.counts.openIssues > 0) {
    cls = 'health-warn';
    label = 'Open issues need attention';
  } else if (u.total === 0) {
    cls = 'health-warn';
    label = 'No monitoring data yet';
  } else {
    cls = 'health-good';
    label = 'All systems operational';
  }
  chip.className = 'health-chip ' + cls;
  chip.replaceChildren(el('i', 'hc-dot'), el('span', '', label));
}

/**
 * Render the KPI tile row (icon, value, hint, mini meter).
 * @param {object} d - Dashboard payload.
 */
function renderKpis(d) {
  const c = d.counts;
  const u = d.uptime;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const kpis = [
    {
      key: 'devices', label: 'Network devices', value: c.devices,
      hint: u.total > 0 ? `${u.total} monitored` : 'none monitored yet',
      cls: '', meter: pct(u.total, c.devices),
    },
    {
      key: 'online', label: 'Devices online', value: u.total ? `${u.up}/${u.total}` : '0/0',
      hint: u.total ? `${pct(u.up, u.total)}% availability` : 'run a check to start',
      cls: u.down > 0 ? 'bad' : 'good', meter: pct(u.up, u.total),
    },
    {
      key: 'cables', label: 'Cable runs active', value: c.cablesActive,
      hint: `${c.cables} total runs`, cls: '', meter: pct(c.cablesActive, c.cables),
    },
    {
      key: 'incidents', label: 'Open incidents', value: c.openIssues,
      hint: c.openIssues > 0 ? 'require attention' : 'all clear',
      cls: c.openIssues > 0 ? 'warn' : 'good', meter: 0,
    },
    {
      key: 'conflicts', label: 'IP conflicts', value: c.ipConflicts,
      hint: c.ipConflicts > 0 ? 'addresses collide' : 'no conflicts',
      cls: c.ipConflicts > 0 ? 'bad' : 'good', meter: 0,
    },
    {
      key: 'failed', label: 'Failed cable tests', value: c.cablesFailedTest,
      hint: c.cablesFailedTest > 0 ? 'need re-testing' : 'all passed',
      cls: c.cablesFailedTest > 0 ? 'bad' : 'good', meter: 0,
    },
  ];
  $('#dashKpis').replaceChildren(...kpis.map((k) => {
    const card = el('div', 'kpi ' + (k.cls || ''));
    const top = el('div', 'kpi-top');
    const meta = el('div');
    meta.append(el('div', 'kpi-value', String(k.value)), el('div', 'kpi-label', k.label));
    top.append(el('div', 'kpi-ico', ico(k.key)), meta);
    const hint = el('div', 'kpi-hint', k.hint);
    card.append(top, hint, meterFill(k.meter, 'kpi-meter'));
    return card;
  }));
}

/**
 * Render the availability donut (up/down/not-checked) with a legend.
 * @param {object} d - Dashboard payload.
 */
function renderDonut(d) {
  const u = d.uptime;
  const wrap = $('#dashDonut');
  if (u.total === 0) {
    wrap.replaceChildren(el('div', 'dash-empty', 'No monitoring data yet. Run a check to see live availability.'));
    return;
  }
  const upDeg = (u.up / u.total) * 360;
  const downDeg = ((u.up + u.down) / u.total) * 360;
  const donut = el('div', 'donut');
  donut.style.background =
    `conic-gradient(from -90deg, var(--green) 0deg ${upDeg}deg, var(--red) ${upDeg}deg ${downDeg}deg, var(--panel-2) ${downDeg}deg 360deg)`;
  const hole = el('div', 'donut-hole');
  hole.append(el('div', 'donut-pct', Math.round((u.up / u.total) * 100) + '%'), el('div', 'donut-cap', 'online'));
  donut.append(hole);

  const legend = el('div', 'donut-legend');
  const mkLg = (color, label, n) => {
    const row = el('div', 'lg-row');
    const dot = el('span', 'lg-dot');
    dot.style.background = color;
    row.append(dot, el('span', 'lg-l', label), el('span', 'lg-n', n));
    return row;
  };
  legend.append(
    mkLg('var(--green)', 'Up', u.up),
    mkLg('var(--red)', 'Down', u.down),
    mkLg('var(--muted)', 'Not checked', u.total - u.up - u.down)
  );
  const avgRtt = u.monitored.filter((m) => m.rtt_ms != null);
  if (avgRtt.length) {
    const avg = (avgRtt.reduce((s, m) => s + m.rtt_ms, 0) / avgRtt.length).toFixed(0);
    legend.append(el('div', 'lg-avg', 'Avg RTT  ' + avg + ' ms'));
  }
  wrap.replaceChildren(donut, legend);
}

/**
 * Render device distribution as horizontal progress meter rows.
 * @param {object} d - Dashboard payload.
 */
function renderTypes(d) {
  const box = $('#dashTypes');
  const types = d.deviceTypes || [];
  if (types.length === 0) { box.append(el('div', 'dash-empty', 'No devices in the inventory yet.')); return; }
  const max = Math.max(...types.map((t) => Number(t.n)), 1);
  types.forEach((t) => {
    const row = el('div', 'type-row');
    const top = el('div', 'type-top');
    top.append(el('span', 'type-name', t.device_type || 'Other'), el('span', 'type-n', t.n));
    row.append(top, meterFill((Number(t.n) / max) * 100));
    box.append(row);
  });
}

/**
 * Render VLAN utilization rows with a chip, subnet, device count, and meter.
 * @param {object} d - Dashboard payload.
 */
function renderVlans(d) {
  const box = $('#dashVlans');
  const vlans = d.vlans || [];
  if (vlans.length === 0) { box.append(el('div', 'dash-empty', 'No VLANs defined yet.')); return; }
  const max = Math.max(...vlans.map((v) => Number(v.devices)), 1);
  vlans.forEach((v) => {
    const row = el('div', 'vlan-row');
    const top = el('div', 'vlan-top');
    top.append(el('span', 'vlan-chip', 'VLAN ' + v.vlan_id), el('span', 'vlan-name', v.name));
    const meta = el('div', 'vlan-meta');
    meta.append(el('span', 'vlan-sub', v.subnet || 'no subnet'), el('span', 'vlan-count', v.devices + ' dev'));
    row.append(top, meta, meterFill((Number(v.devices) / max) * 100));
    box.append(row);
  });
}

/**
 * Render the most recent open incidents, severity-tinted.
 * @param {Array} issues - Issue records from /api/v1/issues.
 */
function renderIssues(issues) {
  const box = $('#dashIssues');
  const open = issues.filter((i) => i.status !== 'Resolved' && i.status !== 'Closed');
  if (open.length === 0) {
    box.append(el('div', 'dash-empty', 'No open incidents — everything is calm.'));
    return;
  }
  open.slice(0, 4).forEach((i) => {
    const row = el('div', 'issue-row sev-' + (i.severity || 'Medium').toLowerCase());
    const body = el('div', 'issue-body');
    body.append(el('div', 'issue-title', i.title));
    const meta = el('div', 'issue-meta');
    meta.append(
      el('span', '', i.device_name || 'Unassigned'),
      el('span', 'dot-sep', '·'),
      el('span', '', fmtTime(i.created_at)),
      el('span', 'dot-sep', '·'),
      el('span', '', i.reporter || '')
    );
    body.append(meta);
    row.append(body, statusPillIssue(i.status));
    box.append(row);
  });
}

/**
 * Render the monitored device reachability list, sorted by worst status first.
 * @param {object} d - Dashboard payload.
 */
function renderReach(d) {
  const box = $('#dashUptime');
  const u = d.uptime;
  if (u.total === 0) {
    box.append(el('div', 'dash-empty', 'No monitored devices yet. Enable monitoring or visit the Monitoring tab.'));
    return;
  }
  const order = { down: 0, up: 1, unknown: 2 };
  const rows = [...u.monitored].sort((a, b) => order[a.status || 'unknown'] - order[b.status || 'unknown']);
  rows.forEach((m) => {
    const st = m.status || 'unknown';
    const row = el('div', 'reach-row');
    const body = el('div', 'reach-body');
    body.append(el('div', 'reach-name', m.name));
    const meta = el('div', 'reach-meta');
    meta.append(el('span', '', m.ip || 'no IP'), el('span', 'dot-sep', '·'), el('span', '', m.device_type || '—'));
    body.append(meta);
    const side = el('div', 'reach-side');
    if (st === 'up' && m.rtt_ms != null) side.append(el('span', 'reach-rtt', m.rtt_ms + ' ms'));
    if (st === 'down') side.append(el('span', 'reach-down', 'offline'));
    if (m.checked_at) side.append(el('span', 'reach-date', fmtTime(m.checked_at)));
    row.append(el('span', 'dot st-' + st), body, side);
    box.append(row);
  });
}

$('#dashCheckAll').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    const results = await api('/api/v1/monitor/check-all', { method: 'POST' });
    const up = results.filter((r) => r.status === 'up').length;
    toast(`Done — ${up} up, ${results.length - up} down`, results.length - up > 0 ? 'warn' : 'ok');
    loadDashboard();
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run checks';
  }
});

/**
 * Build conflict alert blocks for the dashboard and IP & VLAN views.
 * @param {object} conflicts - Conflict payload from /api/v1/conflicts.
 * @returns {Element[]}
 */
function conflictsBlock(conflicts) {
  const parts = [];
  if (conflicts.duplicateIps.length) {
    const box = el('div', 'alert warn');
    box.append(el('span', 'a-ico', '⚠'), el('span', '', 'IP conflicts detected'));
    const ul = el('ul');
    conflicts.duplicateIps.forEach((c) => ul.append(el('li', '', `${c.ip} — ${c.message}`)));
    box.append(ul);
    parts.push(box);
  }
  if (conflicts.outsideSubnet.length || conflicts.gatewayConflicts.length) {
    const box = el('div', 'alert warn');
    box.append(el('span', 'a-ico', '⚠'), el('span', '', 'Configuration warnings'));
    const ul = el('ul');
    conflicts.outsideSubnet.forEach((c) => ul.append(el('li', '', c.message)));
    conflicts.gatewayConflicts.forEach((c) => ul.append(el('li', '', c.message)));
    box.append(ul);
    parts.push(box);
  }
  return parts;
}

// ---------- Infrastructure ----------
/** @type {{rooms: Array, outlets: Array, panels: Array}} */
let roomsCache = { rooms: [], outlets: [], panels: [] };

/**
 * Load all infrastructure tables and render them.
 * Caches data for modal dropdowns.
 */
async function loadInfrastructure() {
  const [rooms, outlets, panels, cables] = await Promise.all([
    api('/api/v1/rooms'), api('/api/v1/outlets'), api('/api/v1/patchpanels'), api('/api/v1/cables'),
  ]);
  roomsCache = { rooms, panels, outlets };

  $('#roomsBody').replaceChildren(...(rooms.length
    ? rooms.map((r) => {
        const tr = el('tr');
        tr.append(el('td', '', r.name), el('td', '', r.floor || '—'), el('td', '', r.purpose || '—'));
        tr.append(rowActions('rooms', r, () => api('/api/v1/rooms/' + r.id, { method: 'DELETE' })));
        return tr;
      })
    : [emptyRow(4, 'No rooms documented yet.')]));

  $('#outletsBody').replaceChildren(...(outlets.length
    ? outlets.map((o) => {
        const tr = el('tr');
        tr.append(el('td', '', o.label), el('td', '', o.location || '—'), el('td', '', o.room_name));
        tr.append(rowActions('outlets', o, () => api('/api/v1/outlets/' + o.id, { method: 'DELETE' })));
        return tr;
      })
    : [emptyRow(4, 'No wall outlets documented yet.')]));

  $('#panelsBody').replaceChildren(...(panels.length
    ? panels.map((p) => {
        const tr = el('tr');
        tr.append(el('td', '', p.name), el('td', '', p.location || '—'), el('td', '', p.ports));
        tr.append(rowActions('patchpanels', p, () => api('/api/v1/patchpanels/' + p.id, { method: 'DELETE' })));
        return tr;
      })
    : [emptyRow(4, 'No patch panels documented yet.')]));

  $('#cablesBody').replaceChildren(...(cables.length
    ? cables.map((c) => {
        const tr = el('tr');
        tr.append(
          el('td', '', c.cable_id),
          el('td', '', c.outlet_label || '—'),
          el('td', '', c.room_name || '—'),
          el('td', '', c.panel_name || '—'),
          el('td', '', c.patch_port || '—'),
          el('td', '', c.cable_type),
          el('td', '', c.length_m != null ? c.length_m + ' m' : '—'),
          el('td', '', testPill(c.test_result)),
          el('td', '', statusPill(c.status))
        );
        tr.append(rowActions('cables', c, () => api('/api/v1/cables/' + c.id, { method: 'DELETE' })));
        return tr;
      })
    : [emptyRow(10, 'No cable runs logged yet. Wire it up!')]));
}

/**
 * Create a small delete button wired to an async action.
 * @param {() => Promise<void>} run
 * @returns {HTMLButtonElement}
 */
function delBtn(run) {
  const b = el('button', 'btn sm danger', 'Delete');
  b.onclick = async () => {
    try { await run(); toast('Entry deleted'); reloadCurrent(); }
    catch (e) { toast(e.message, 'err'); }
  };
  return b;
}

/**
 * Create a small edit button that opens the record in the modal.
 * @param {string} entity - Entity key used to look up the modal form spec.
 * @param {object} record - Existing record used to pre-fill the form.
 * @returns {HTMLButtonElement}
 */
function editBtn(entity, record) {
  const b = el('button', 'btn sm ghost', 'Edit');
  b.onclick = () => openModal(entity, record);
  return b;
}

/**
 * Build a full action cell with Edit + Delete buttons.
 * @param {string} entity - Entity key for the modal form spec.
 * @param {object} record - Record to edit.
 * @param {() => Promise<void>} delRun - Delete action.
 * @returns {HTMLTableCellElement}
 */
function rowActions(entity, record, delRun) {
  const td = el('td', '');
  const box = el('div', 'actions');
  box.append(editBtn(entity, record), delBtn(delRun));
  td.append(box);
  return td;
}

const testPill = (v) => v === 'Pass' ? pill('pass', 'Pass') : v === 'Fail' ? pill('fail', 'Fail') : pill('pending', v || 'Pending');
const statusPill = (v) => v === 'Active' ? pill('active', 'Active') : pill('inactive', v || '—');

// ---------- IP & VLAN ----------
/** @type {{rooms: Array, outlets: Array, panels: Array, vlans: Array}} */
const vlansCache = { rooms: [], outlets: [], panels: [], vlans: [] };

/**
 * Load VLANs, devices, and IP conflicts. Render conflict alerts and both tables.
 */
async function loadIpVlan() {
  const [vlans, devices, conflicts] = await Promise.all([api('/api/v1/vlans'), api('/api/v1/devices'), api('/api/v1/conflicts')]);
  vlansCache.vlans = vlans;

  $('#ipvlanConflicts').replaceChildren(...conflictsBlock(conflicts));
  if (conflicts.duplicateIps.length === 0 && conflicts.outsideSubnet.length === 0 && conflicts.gatewayConflicts.length === 0) {
    $('#ipvlanConflicts').append(el('div', 'alert info', 'No IP conflicts detected. Addresses are clean.'));
  }

  const countByVlan = {};
  devices.forEach((d) => { if (d.vlan_id != null) countByVlan[d.vlan_id] = (countByVlan[d.vlan_id] || 0) + 1; });

  $('#vlansBody').replaceChildren(...(vlans.length
    ? vlans.map((v) => {
        const tr = el('tr');
        tr.append(
          el('td', '', 'VLAN ' + v.vlan_id),
          el('td', '', v.name),
          el('td', '', v.subnet || '—'),
          el('td', '', v.gateway || '—'),
          el('td', '', countByVlan[v.id] || 0),
          rowActions('vlans', v, () => api('/api/v1/vlans/' + v.id, { method: 'DELETE' }))
        );
        return tr;
      })
    : [emptyRow(6, 'No VLANs defined yet.')]));

  $('#devicesBody').replaceChildren(...(devices.length
    ? devices.map((d) => {
        const tr = el('tr', d.monitored ? '' : 'row-dim');
        const vlanTxt = d.vlan_number ? `VLAN ${d.vlan_number}` + (d.vlan_name ? ` (${d.vlan_name})` : '') : '—';
        tr.append(
          el('td', '', d.name),
          el('td', '', d.ip || '—'),
          el('td', '', d.device_type || '—'),
          el('td', '', vlanTxt),
          el('td', '', d.mac || '—'),
          el('td', '', d.location || '—')
        );
        const tdM = el('td', '');
        const toggle = el('input');
        toggle.type = 'checkbox';
        toggle.checked = !!d.monitored;
        toggle.title = 'Toggle monitoring';
        toggle.setAttribute('aria-label', `Monitor ${d.name}`);
        toggle.onchange = async () => {
          try {
            await api('/api/v1/devices/' + d.id, { method: 'PATCH', body: JSON.stringify({ monitored: toggle.checked ? 1 : 0 }) });
            toast(d.name + ' monitoring ' + (toggle.checked ? 'enabled' : 'disabled'));
          } catch (e) { toggle.checked = !toggle.checked; toast(e.message, 'err'); }
        };
        tdM.append(toggle);
        tr.append(tdM, rowActions('devices', d, () => api('/api/v1/devices/' + d.id, { method: 'DELETE' })));
        return tr;
      })
    : [emptyRow(8, 'No devices in the inventory yet.')]));
}

// ---------- Monitoring ----------
let refreshTimer = null;

/**
 * Load the monitoring status table.
 * Shows UP/DOWN, RTT, and provides per-device check + history buttons.
 */
async function loadMonitoring() {
  const status = await api('/api/v1/monitor/status');
  const summary = $('#monitorSummary');
  if (status.length === 0) {
    $('#monitorBody').replaceChildren(emptyRow(8, 'No monitored devices yet. Enable monitoring on a device, or add one.'));
    summary.textContent = '';
    return;
  }
  const up = status.filter((s) => s.last_status === 'up').length;
  const down = status.filter((s) => s.last_status === 'down').length;
  summary.textContent = `${up} up · ${down} down · ${status.length - up - down} not checked`;
  $('#monitorBody').replaceChildren(...status.map((s) => {
    const tr = el('tr');
    const st = s.last_status ? pill(s.last_status, s.last_status === 'up' ? 'UP' : 'DOWN') : pill('pending', 'Never checked');
    const tdSt = el('td', ''); tdSt.append(st);
    const histBtn = el('button', 'btn sm ghost', 'History');
    histBtn.onclick = () => showHistory(s);
    const tdH = el('td', ''); tdH.append(histBtn);
    const checkBtn = el('button', 'btn sm primary', 'Check');
    checkBtn.onclick = async () => { await doCheck(s.id, checkBtn); loadMonitoring(); };
    const tdC = el('td', ''); tdC.append(checkBtn);
    tr.append(
      el('td', '', s.name), el('td', '', s.ip),
      el('td', '', s.device_type || '—'), tdSt,
      el('td', '', s.last_rtt != null ? s.last_rtt + ' ms' : '—'),
      el('td', '', fmtTime(s.last_checked)), tdH, tdC
    );
    return tr;
  }));
}

/**
 * Run a single ICMP check and show the result.
 * @param {number} id - Device ID.
 * @param {HTMLButtonElement} btn - Button to show spinner on.
 */
async function doCheck(id, btn) {
  const orig = btn.textContent;
  btn.disabled = true;
  btn.replaceChildren(el('span', 'spinner'));
  try {
    const r = await api('/api/v1/monitor/check/' + id, { method: 'POST' });
    toast(`${r.name} → ${r.status.toUpperCase()}${r.rttMs != null ? ' (' + r.rttMs + ' ms)' : ''}`,
      r.status === 'up' ? 'ok' : 'warn');
  } catch (e) {
    toast(e.message, 'err');
  }
  btn.disabled = false;
  btn.textContent = orig;
}

/**
 * Check all monitored/infrastructure devices at once.
 */
async function checkAll() {
  const btn = $('#checkAll');
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    const results = await api('/api/v1/monitor/check-all', { method: 'POST' });
    const up = results.filter((r) => r.status === 'up').length;
    toast(`Done — ${up} up, ${results.length - up} down`, results.length - up > 0 ? 'warn' : 'ok');
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Check all now';
    loadMonitoring();
  }
}

$('#checkAll').addEventListener('click', checkAll);

$('#autoRefresh').addEventListener('change', (e) => {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  if (e.target.checked) {
    refreshTimer = setInterval(() => { if (currentTab === 'monitoring') loadMonitoring(); }, 15000);
    toast('Auto-refresh enabled (15s)', 'ok');
  } else {
    toast('Auto-refresh disabled');
  }
});

/**
 * Show monitoring history for a device below the table.
 * @param {{id: number, name: string, ip: string}} s
 */
async function showHistory(s) {
  const hist = await api('/api/v1/monitor/history/' + s.id);
  const pane = $('#historyPane');
  pane.style.display = 'block';
  pane.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  const head = el('h4', '', `Monitoring history — ${s.name} (${s.ip})`);
  const close = el('button', 'btn sm ghost', 'Close');
  close.onclick = () => { pane.style.display = 'none'; };
  const wrap = el('div', 'block-head');
  wrap.append(head, close);
  pane.replaceChildren(wrap);
  if (hist.length === 0) pane.append(el('div', 'muted', 'No checks recorded for this device yet.'));
  hist.forEach((h) => {
    const line = el('div', 'hist-line');
    line.append(
      el('span', '', fmtTime(h.checked_at) + '  '),
      pill(h.status, h.status.toUpperCase()),
      el('span', '', h.rtt_ms != null ? '  ' + h.rtt_ms + ' ms' : '')
    );
    pane.append(line);
  });
}

// ---------- Incidents ----------

/**
 * Load issues, update the nav badge, and render the table.
 */
async function loadIncidents() {
  const issues = await api('/api/v1/issues');
  const badge = $('#openIssueBadge');
  const open = issues.filter((i) => i.status !== 'Resolved' && i.status !== 'Closed').length;
  if (open > 0) { badge.textContent = open; badge.hidden = false; } else badge.hidden = true;

  $('#issuesBody').replaceChildren(...(issues.length
    ? issues.map((i) => {
        const tr = el('tr');
        tr.append(
          el('td', '', statusPillIssue(i.status)),
          el('td', '', i.title),
          el('td', '', sevPill(i.severity)),
          el('td', '', i.device_name || '—'),
          el('td', '', i.outlet_label || '—'),
          el('td', '', i.reporter || '—'),
          el('td', '', fmtDate(i.created_at))
        );
        const act = el('td', '');
        act.append(advanceBtn(i), editBtn('issues', i), delBtn(() => api('/api/v1/issues/' + i.id, { method: 'DELETE' })));
        tr.append(act);
        return tr;
      })
    : [emptyRow(8, 'No incidents logged. Keep it that way!')]));
}

const statusPillIssue = (v) => {
  const map = { 'Open': 'open', 'In Progress': 'in-progress', 'Resolved': 'resolved', 'Closed': 'closed' };
  return pill(map[v] || 'pending', v);
};
const sevPill = (v) => pill((v || 'Medium').toLowerCase(), v || '—');

/**
 * Build a button that advances an issue to the next workflow stage.
 * @param {{id: number, status: string}} issue
 * @returns {HTMLButtonElement|HTMLSpanElement}
 */
function advanceBtn(issue) {
  const next = issue.status === 'Open' ? 'In Progress' : issue.status === 'In Progress' ? 'Resolved' : null;
  if (!next) return el('span', 'muted', '');
  const b = el('button', 'btn sm', next === 'Resolved' ? 'Resolve' : '→ In Progress');
  b.onclick = async () => {
    try {
      await api('/api/v1/issues/' + issue.id, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      toast(`Incident marked ${next}`);
      reloadCurrent();
    } catch (e) { toast(e.message, 'err'); }
  };
  return b;
}

// ---------- Search ----------
let searchTimer = null;

$('#searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (!q) { $('#searchResults').hidden = true; return; }
  searchTimer = setTimeout(async () => search(q), 170);
});
$('#searchInput').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $('#searchResults').hidden = true;
  if (e.key === 'Enter') $('#searchResults').hidden = true;
});

/**
 * Run a global search across all entities and render grouped results.
 * @param {string} q
 */
async function search(q) {
  const res = await api('/api/v1/search?q=' + encodeURIComponent(q));
  const groups = [];
  if (res.devices.length) groups.push(['Devices', 'ipvlan', res.devices.map((d) => d.name + ' · ' + (d.ip || 'no IP') + ' · ' + (d.device_type || ''))]);
  if (res.cables.length) groups.push(['Cables', 'infrastructure', res.cables.map((c) => `${c.cable_id} → ${c.outlet_label || 'unconnected'} · ${c.status}`)]);
  if (res.outlets.length) groups.push(['Outlets', 'infrastructure', res.outlets.map((o) => `${o.label} · ${o.location || ''} · ${o.room_name}`)]);
  if (res.rooms.length) groups.push(['Rooms', 'infrastructure', res.rooms.map((r) => `${r.name} · ${r.floor || ''} ${r.purpose || ''}`)]);
  if (res.vlans.length) groups.push(['VLANs', 'ipvlan', res.vlans.map((v) => `VLAN ${v.vlan_id} ${v.name} · ${v.subnet || ''}`)]);
  if (res.issues.length) groups.push(['Incidents', 'incidents', res.issues.map((i) => `${i.title} · ${i.status}`)]);

  const box = $('#searchResults');
  box.replaceChildren();
  if (groups.length === 0) {
    box.append(el('div', 'sr-empty', `No results for \u201c${q}\u201d`));
  } else {
    groups.forEach(([label, tab, items]) => {
      box.append(el('div', 'sr-group', label));
      items.forEach((txt) => {
        const item = el('div', 'sr-item');
        item.append(el('span', 'k', label), el('span', 'v', txt));
        item.onclick = () => { box.hidden = true; $('#searchInput').value = ''; goTab(tab); };
        box.append(item);
      });
    });
  }
  box.hidden = false;
}

// ---------- Modals / forms ----------
const forms = {
  rooms: {
    title: 'Add room', titleEdit: 'Edit room', post: '/api/v1/rooms',
    fields: [
      ['name', 'text', 'Room name', true], ['floor', 'text', 'Floor'],
      ['purpose', 'text', 'Purpose', false, null, 'full'],
    ],
  },
  outlets: {
    title: 'Add wall outlet', titleEdit: 'Edit wall outlet', post: '/api/v1/outlets',
    fields: [
      ['label', 'text', 'Label (e.g. A-101)', true], ['location', 'text', 'Location'],
      ['room_id', 'select', 'Room', false, () => roomsCache.rooms.map((r) => ({ v: r.id, l: r.name }))],
    ],
  },
  patchpanels: {
    title: 'Add patch panel', titleEdit: 'Edit patch panel', post: '/api/v1/patchpanels',
    fields: [
      ['name', 'text', 'Panel name', true], ['location', 'text', 'Location'],
      ['ports', 'number', 'Ports'],
    ],
  },
  cables: {
    title: 'Add cable run', titleEdit: 'Edit cable run', post: '/api/v1/cables',
    fields: [
      ['cable_id', 'text', 'Cable ID', true], ['patch_port', 'text', 'Patch panel port'],
      ['outlet_id', 'select', 'Wall outlet', false, () => roomsCache.outlets.map((o) => ({ v: o.id, l: `${o.label} · ${o.room_name}` }))],
      ['patch_panel_id', 'select', 'Patch panel', false, () => roomsCache.panels.map((p) => ({ v: p.id, l: `${p.name} · ${p.location || ''}` }))],
      ['length_m', 'number', 'Length (m)'],
      ['cable_type', 'select', 'Cable type', false, () => [{ v: 'Cat5e', l: 'Cat5e' }, { v: 'Cat6', l: 'Cat6' }, { v: 'Cat6a', l: 'Cat6a' }]],
      ['test_result', 'select', 'Test result', false, () => [{ v: 'Pending', l: 'Pending' }, { v: 'Pass', l: 'Pass' }, { v: 'Fail', l: 'Fail' }]],
      ['status', 'select', 'Status', false, () => [{ v: 'Active', l: 'Active' }, { v: 'Inactive', l: 'Inactive' }]],
      ['notes', 'text', 'Notes', false, null, 'full'],
    ],
  },
  vlans: {
    title: 'Add VLAN', titleEdit: 'Edit VLAN', post: '/api/v1/vlans',
    fields: [
      ['vlan_id', 'number', 'VLAN ID', true], ['name', 'text', 'VLAN name', true],
      ['subnet', 'text', 'Subnet (e.g. 192.168.10.0/24)'], ['gateway', 'text', 'Gateway'],
      ['description', 'text', 'Description', false, null, 'full'],
    ],
  },
  devices: {
    title: 'Add device', titleEdit: 'Edit device', post: '/api/v1/devices',
    fields: [
      ['name', 'text', 'Device name', true], ['ip', 'text', 'IP address'],
      ['device_type', 'select', 'Device type', false, () => [
        { v: 'Router', l: 'Router' }, { v: 'Switch', l: 'Switch' },
        { v: 'Server', l: 'Server' }, { v: 'Workstation', l: 'Workstation' },
      ]],
      ['vlan_id', 'select', 'VLAN', false, () => vlansCache.vlans.map((v) => ({ v: v.id, l: `VLAN ${v.vlan_id} ${v.name}` }))],
      ['mac', 'text', 'MAC address'], ['location', 'text', 'Location'],
      ['monitored', 'select', 'Monitor', false, () => [{ v: 1, l: 'Yes' }, { v: 0, l: 'No' }]],
    ],
  },
  issues: {
    title: 'Log incident', titleEdit: 'Edit incident', post: '/api/v1/issues',
    fields: [
      ['title', 'text', 'Short summary', true, null, 'full'],
      ['description', 'textarea', 'Details (symptoms, troubleshooting...)', false, null, 'full'],
      ['severity', 'select', 'Severity', false, () => [{ v: 'Low', l: 'Low' }, { v: 'Medium', l: 'Medium' }, { v: 'High', l: 'High' }]],
      ['status', 'select', 'Status', false, () => [{ v: 'Open', l: 'Open' }, { v: 'In Progress', l: 'In Progress' }, { v: 'Resolved', l: 'Resolved' }, { v: 'Closed', l: 'Closed' }]],
      ['device_id', 'select', 'Related device (optional)', false, null],
      ['outlet_id', 'select', 'Related outlet (optional)', false, null],
      ['reporter', 'text', 'Reported by'],
    ],
  },
};

/**
 * Pre-fetch data needed for modal dropdowns.
 */
async function warmCaches() {
  const [rooms, outlets, panels, vlans, devices] = await Promise.all([
    api('/api/v1/rooms'), api('/api/v1/outlets'), api('/api/v1/patchpanels'), api('/api/v1/vlans'), api('/api/v1/devices'),
  ]);
  roomsCache = { rooms, panels, outlets, vlans };
  window.__devicesCache = devices;
}

/**
 * Render a single form field inside the modal.
 * @param {HTMLFormElement} form
 * @param {Array} f - Field spec: [name, type, label, required, options, span]
 */
function addField(form, [name, type, label, required, options, span]) {
  const wrap = el('div', 'field' + (span ? ' ' + span : ''));
  const lab = el('label', '', label);
  if (required) lab.append(el('span', 'muted', ' *'));
  let input;
  if (type === 'select') {
    input = el('select');
    const opts = typeof options === 'function' ? options() : options;
    (opts || []).forEach((o) => input.append(new Option(o.l, o.v)));
    if (name !== 'monitored') input.prepend(new Option('— none —', ''));
  } else if (type === 'textarea') {
    input = el('textarea');
    input.rows = 3;
  } else {
    input = el('input');
    if (type === 'number') input.type = 'number';
  }
  input.name = name;
  if (!required) input.required = false;
  else input.required = true;
  wrap.append(lab, input);
  form.append(wrap);
}

/**
 * Open the create- or edit-modal for the given entity.
 * @param {'rooms'|'outlets'|'patchpanels'|'cables'|'vlans'|'devices'|'issues'} entity
 * @param {object|null} [edit] - Existing record to pre-fill for editing, or null to create.
 */
function openModal(entity, edit = null) {
  const spec = forms[entity];
  const isEdit = !!edit;
  const form = $('#modalForm');
  form.replaceChildren();
  $('#modalTitle').textContent = isEdit ? (spec.titleEdit || spec.title) : spec.title;

  spec.fields.forEach((f) => {
    if (f[0] === 'device_id') {
      f[4] = () => (window.__devicesCache || []).map((d) => ({ v: d.id, l: `${d.name} (${d.ip || 'no IP'})` }));
    }
    if (f[0] === 'outlet_id') {
      f[4] = () => roomsCache.outlets.map((o) => ({ v: o.id, l: `${o.label} · ${o.room_name}` }));
    }
    addField(form, f);
    if (isEdit) {
      const field = form.querySelector(`[name="${f[0]}"]`);
      if (field) {
        const val = edit[f[0]];
        field.value = (val === null || val === undefined) ? '' : val;
      }
    }
  });

  const actions = el('div', 'modal-actions');
  const cancel = el('button', 'btn ghost', 'Cancel');
  cancel.onclick = closeModal;
  const save = el('button', 'btn primary', isEdit ? 'Save changes' : 'Save');
  save.onclick = async () => {
    const body = {};
    form.querySelectorAll('input, select, textarea').forEach((i) => {
      if (i.name) body[i.name] = i.value;
    });
    for (const k of ['room_id', 'outlet_id', 'patch_panel_id', 'vlan_id', 'device_id', 'ports', 'length_m']) {
      if (body[k] !== undefined && body[k] !== '') body[k] = Number(body[k]);
    }
    save.disabled = true;
    try {
      if (isEdit) {
        await api(spec.post + '/' + edit.id, { method: 'PATCH', body: JSON.stringify(body) });
        toast('Updated');
      } else {
        await api(spec.post, { method: 'POST', body: JSON.stringify(body) });
        toast('Saved');
      }
      closeModal();
      reloadCurrent();
      warmCaches();
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      save.disabled = false;
    }
  };
  actions.append(cancel, save);
  form.append(actions);
  $('#modal').classList.add('show');
  $(`#modalForm input[name="${spec.fields[0][0]}"], #modalForm textarea[name="${spec.fields[0][0]}"]`)?.focus();
}

function closeModal() {
  $('#modal').classList.remove('show');
  $('#modalForm').replaceChildren();
}
$('#modalClose').addEventListener('click', closeModal);
$('#modal').addEventListener('click', (e) => { if (e.target === $('#modal')) closeModal(); });

$('#content').addEventListener('click', (e) => {
  const add = e.target.closest('[data-entity]');
  if (add) openModal(add.dataset.entity);
});

/**
 * Re-run the current tab's loader.
 */
function reloadCurrent() {
  loadTab(currentTab);
}

// ---------- Exports ----------
$('#content').addEventListener('click', (e) => {
  const exp = e.target.closest('[data-export]');
  if (exp) {
    const a = el('a');
    a.href = '/api/v1/export/' + exp.dataset.export + '.csv';
    a.download = exp.dataset.export + '.csv';
    document.body.append(a);
    a.click();
    a.remove();
    toast('Exporting ' + exp.dataset.export + ' log…');
  }
});

// ---------- Diagram editor ----------
const DIAG_W = 1200;
const DIAG_H = 680;
/** @type {{nodes: Array, links: Array, zones: Array}} */
const diag = { nodes: [], links: [], zones: [] };
/** @type {Record<number, string>} device_id -> 'up' | 'down' */
let diagStatus = {};
let diagSel = null;                // selected node id
let diagSelZone = null;            // selected zone/site id
let diagPlace = null;              // active type to place (or null)
let diagConnFrom = null;           // connect-mode first node id
let diagSaveTimer = null;

const DEFAULT_LABEL = { router: 'Router', switch: 'Switch', server: 'Server', pc: 'PC', printer: 'Printer', cloud: 'Internet' };

/**
 * Load diagram data, device inventory, and monitoring status.
 * Renders the SVG canvas and populates the device-link dropdown.
 */
async function loadDiagram() {
  const [saved, devices, statuses] = await Promise.all([
    api('/api/v1/diagram'), api('/api/v1/devices'), api('/api/v1/monitor/status'),
  ]);
  diag.nodes = saved.nodes || [];
  diag.links = saved.links || [];
  diag.zones = saved.zones || [];
  window.__devicesCache = devices;
  diagStatus = {};
  statuses.forEach((s) => { if (s.id != null) diagStatus[s.id] = s.last_status; });

  const sel = $('#diagDeviceLink');
  sel.replaceChildren();
  sel.append(new Option('Attach to device…', ''));
  devices.forEach((d) => sel.append(new Option(`${d.name}${d.ip ? ' (' + d.ip + ')' : ''}`, d.id)));

  renderDiagram();
}

/** Generate a unique node identifier. */
function uid() { return 'n' + Math.random().toString(36).slice(2, 9); }

/** Find a node by its id. */
function nodeById(id) { return diag.nodes.find((n) => n.id === id); }

/**
 * Determine which zone (if any) contains the given canvas coordinates.
 * @param {number} x
 * @param {number} y
 * @returns {string|null}
 */
function zoneAt(x, y) {
  const z = diag.zones.find((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
  return z ? z.id : null;
}

function selectNode(id) { diagSel = id; diagSelZone = null; }
function selectZone(id) { diagSelZone = id; diagSel = null; }

/**
 * Place a new device node on the canvas at the given coordinates.
 * @param {'router'|'switch'|'server'|'pc'|'printer'|'cloud'} type
 * @param {number} x
 * @param {number} y
 */
function placeNode(type, x, y) {
  const count = diag.nodes.filter((n) => n.type === type).length;
  const n = { id: uid(), type, label: (DEFAULT_LABEL[type] || type) + (count ? '-' + (count + 1) : ''), x, y, device_id: null, zone: zoneAt(x, y) };
  diag.nodes.push(n);
  selectNode(n.id);
  renderDiagram();
  touchDiagram();
}

/**
 * Re-render the entire diagram SVG from the current `diag` state.
 */
function renderDiagram() {
  const svg = $('#diagCanvas');
  svg.replaceChildren(diagDefs(), diagBgRect());
  diag.zones.forEach((z) => svg.appendChild(zoneGroup(z)));
  diag.links.forEach((l) => {
    const a = nodeById(l.from); const b = nodeById(l.to);
    if (!a || !b) return;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
    line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
    line.classList.add('diag-link');
    svg.appendChild(line);
  });
  diag.nodes.forEach((n) => svg.appendChild(nodeGroup(n)));
  const rename = $('#diagZoneRename');
  if (rename) rename.disabled = !diagSelZone;
}

function diagDefs() {
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
  pattern.setAttribute('id', 'diagGrid');
  pattern.setAttribute('width', '24'); pattern.setAttribute('height', '24');
  pattern.setAttribute('patternUnits', 'userSpaceOnUse');
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', '1'); dot.setAttribute('cy', '1'); dot.setAttribute('r', '1');
  dot.classList.add('diag-grid-dot');
  pattern.appendChild(dot);
  defs.appendChild(pattern);
  return defs;
}

function diagBgRect() {
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('x', '0'); rect.setAttribute('y', '0');
  rect.setAttribute('width', DIAG_W); rect.setAttribute('height', DIAG_H);
  rect.setAttribute('fill', 'url(#diagGrid)');
  return rect;
}

const ZONE_COUNTS = { router: 'Router', switch: 'Switch', server: 'Server', pc: 'PC', printer: 'Printer', cloud: 'Internet' };

/**
 * Build a human-readable count string for a zone, e.g. "2 Routers · 1 Server".
 * @param {{id: string, nodes: Array}} z
 * @returns {string}
 */
function zoneCountText(z) {
  const counts = {};
  diag.nodes.forEach((n) => {
    if (n.zone !== z.id) return;
    const label = ZONE_COUNTS[n.type] || n.type;
    counts[label] = (counts[label] || 0) + 1;
  });
  const plural = (w, v) => v === 1 ? w : w + (w.endsWith('ch') ? 'es' : w.endsWith('y') ? 'ies' : 's');
  return Object.entries(counts).map(([k, v]) => `${v} ${plural(k, v)}`).join(' · ');
}

/**
 * Build the SVG group for a zone (site/office rectangle).
 * @param {{id: string, label: string, x: number, y: number, w: number, h: number}} z
 * @returns {SVGGElement}
 */
function zoneGroup(z) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs, cls) => {
    const e = document.createElementNS(svgNS, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (cls) e.classList.add(cls);
    return e;
  };
  const g = mk('g', { 'data-id': z.id });
  g.classList.add('diag-zone');
  if (z.id === diagSelZone) g.classList.add('sel');

  g.appendChild(mk('rect', { x: z.x, y: z.y, width: z.w, height: z.h }, 'zone-body'));
  const title = mk('text', { x: z.x + 14, y: z.y + 24, 'text-anchor': 'start' }, 'zone-title');
  title.textContent = z.label || 'Site';
  g.appendChild(title);

  const count = mk('text', { x: z.x + 14, y: z.y + z.h - 14, 'text-anchor': 'start' }, 'zone-count');
  count.textContent = zoneCountText(z) || '';
  g.appendChild(count);

  const hit = mk('rect', { x: z.x, y: z.y, width: z.w, height: z.h }, 'zone-hit');
  hit.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (diagPlace) {
      const rect = $('#diagCanvas').getBoundingClientRect();
      placeNode(diagPlace,
        Math.round((e.clientX - rect.left) * (DIAG_W / rect.width)),
        Math.round((e.clientY - rect.top) * (DIAG_H / rect.height)));
      return;
    }
    selectZone(z.id);
    startZoneDrag(z, e);
  });
  g.appendChild(hit);

  const resize = mk('rect', { x: z.x + z.w - 16, y: z.y + z.h - 16, width: 16, height: 16 }, 'zone-resize');
  resize.addEventListener('pointerdown', (e) => { e.stopPropagation(); selectZone(z.id); startZoneResize(z, e); });
  g.appendChild(resize);

  return g;
}

function startZoneDrag(z, e) {
  const svg = $('#diagCanvas');
  const rect = svg.getBoundingClientRect();
  const offX = z.x - (e.clientX - rect.left) * (DIAG_W / rect.width);
  const offY = z.y - (e.clientY - rect.top) * (DIAG_H / rect.height);
  let moved = false;
  const move = (ev) => {
    moved = true;
    const nx = Math.round((ev.clientX - rect.left) * (DIAG_W / rect.width) + offX);
    const ny = Math.round((ev.clientY - rect.top) * (DIAG_H / rect.height) + offY);
    const zx = Math.max(0, Math.min(nx, DIAG_W - z.w));
    const zy = Math.max(0, Math.min(ny, DIAG_H - z.h));
    const dx = zx - z.x, dy = zy - z.y;
    z.x = zx; z.y = zy;
    diag.nodes.forEach((n) => { if (n.zone === z.id) { n.x += dx; n.y += dy; } });
    renderDiagram();
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    if (moved) touchDiagram();
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

function startZoneResize(z) {
  const svg = $('#diagCanvas');
  const rect = svg.getBoundingClientRect();
  const sx = z.x, sy = z.y;
  const move = (ev) => {
    const mx = Math.min(Math.round((ev.clientX - rect.left) * (DIAG_W / rect.width)), DIAG_W);
    const my = Math.min(Math.round((ev.clientY - rect.top) * (DIAG_H / rect.height)), DIAG_H);
    z.w = Math.max(90, mx - sx);
    z.h = Math.max(70, my - sy);
    renderDiagram();
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    touchDiagram();
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

function addZone() {
  const z = { id: 'z' + uid(), label: 'New site', x: 70, y: 70, w: 320, h: 180, room_id: null };
  diag.zones.push(z);
  selectZone(z.id);
  renderDiagram();
  touchDiagram();
  renameZone(z);
}

/**
 * Prompt the user to rename a zone label.
 * @param {{id: string, label: string}} z
 */
function renameZone(z) {
  if (!z) return;
  const name = prompt('Site / office name (e.g. Admin Office):', z.label || '');
  if (name && name.trim()) {
    z.label = name.trim();
    renderDiagram();
    touchDiagram();
  }
}

/**
 * Build the SVG group for a single node (device shape + label + hit area).
 * @param {{id: string, type: string, label: string, x: number, y: number, device_id: number|null}} n
 * @returns {SVGGElement}
 */
function nodeGroup(n) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', `translate(${n.x}, ${n.y})`);
  g.setAttribute('data-id', n.id);
  g.classList.add('diag-node');
  if (n.id === diagSel) g.classList.add('sel');

  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  shape.classList.add('shape', 't-' + n.type);
  const st = diagStatus[n.device_id];
  if (st) shape.classList.add('st-' + st);
  else shape.classList.add('st-unknown');
  drawShape(shape, n.type);
  g.appendChild(shape);

  const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  hit.setAttribute('x', '-30'); hit.setAttribute('y', '-26'); hit.setAttribute('width', '60'); hit.setAttribute('height', '52');
  hit.classList.add('diag-hit');
  g.appendChild(hit);

  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.setAttribute('y', '40'); label.setAttribute('text-anchor', 'middle');
  label.classList.add('diag-label');
  label.textContent = n.label || '';
  g.appendChild(label);

  if (n.device_id != null) {
    const dev = (window.__devicesCache || []).find((d) => d.id === n.device_id);
    if (dev && dev.ip) {
      const sub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      sub.setAttribute('y', '55'); sub.setAttribute('text-anchor', 'middle');
      sub.classList.add('diag-sub');
      sub.textContent = dev.ip;
      g.appendChild(sub);
    }
  }

  g.addEventListener('pointerdown', (e) => { e.stopPropagation(); pickNode(n, e); });
  return g;
}

/**
 * Draw the vector icon for a device type into the provided SVG group.
 * @param {SVGGElement} shape
 * @param {'router'|'switch'|'server'|'pc'|'printer'|'cloud'} type
 */
function drawShape(shape, type) {
  const svg = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs) => {
    const e = document.createElementNS(svg, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    shape.appendChild(e);
    return e;
  };
  if (type === 'router') {
    mk('circle', { cx: 0, cy: 0, r: 17 });
    mk('circle', { cx: 0, cy: 0, r: 6 });
    mk('line', { x1: -17, y1: 0, x2: -25, y2: 0 });
    mk('line', { x1: 17, y1: 0, x2: 25, y2: 0 });
    mk('line', { x1: -12, y1: -12, x2: -18, y2: -18 });
    mk('line', { x1: 12, y1: -12, x2: 18, y2: -18 });
    mk('line', { x1: -12, y1: 12, x2: -18, y2: 18 });
    mk('line', { x1: 12, y1: 12, x2: 18, y2: 18 });
  } else if (type === 'switch') {
    mk('rect', { x: -20, y: -9, width: 40, height: 18, rx: 2 });
    [0, 1, 2, 3].forEach((i) => mk('circle', { cx: -12 + i * 8, cy: 0, r: 1.6 }));
  } else if (type === 'server') {
    mk('rect', { x: -19, y: -17, width: 38, height: 34, rx: 2 });
    [0, 1, 2].forEach((i) => mk('line', { x1: -12, y1: -9 + i * 7, x2: 12, y2: -9 + i * 7 }));
    mk('circle', { cx: 11, cy: 11, r: 2 });
  } else if (type === 'pc') {
    mk('rect', { x: -16, y: -13, width: 32, height: 23, rx: 2 });
    mk('rect', { x: -11, y: 12, width: 22, height: 5, rx: 1 });
    mk('rect', { x: -6, y: 17, width: 12, height: 5, rx: 1 });
  } else if (type === 'printer') {
    mk('rect', { x: -17, y: -13, width: 34, height: 20, rx: 2 });
    mk('rect', { x: -13, y: 8, width: 26, height: 5, rx: 1 });
    mk('rect', { x: -10, y: -8, width: 14, height: 8, rx: 1 });
  } else { // cloud / internet
    mk('ellipse', { cx: 0, cy: -3, rx: 24, ry: 13 });
    mk('ellipse', { cx: -12, cy: -8, rx: 13, ry: 9 });
    mk('ellipse', { cx: 12, cy: -8, rx: 13, ry: 9 });
    mk('ellipse', { cx: 0, cy: -10, rx: 15, ry: 10 });
  }
}

function pickNode(n, e) {
  if (diagConnFrom) {
    if (diagConnFrom !== n.id) {
      const dup = diag.links.some((l) =>
        (l.from === diagConnFrom && l.to === n.id) || (l.from === n.id && l.to === diagConnFrom));
      if (!dup) { diag.links.push({ from: diagConnFrom, to: n.id }); touchDiagram(); toast('Connected'); }
    }
    diagConnFrom = null;
    $('#diagConnect').textContent = 'Connect: off';
    $('#diagConnect').classList.remove('active');
    renderDiagram();
    return;
  }
  selectNode(n.id);
  renderDiagram();
  startDrag(n, e);
}

function startDrag(n, e) {
  const svg = $('#diagCanvas');
  const rect = svg.getBoundingClientRect();
  const offX = n.x - (e.clientX - rect.left) * (DIAG_W / rect.width);
  const offY = n.y - (e.clientY - rect.top) * (DIAG_H / rect.height);
  let moved = false;
  const move = (ev) => {
    moved = true;
    n.x = Math.round((ev.clientX - rect.left) * (DIAG_W / rect.width) + offX);
    n.y = Math.round((ev.clientY - rect.top) * (DIAG_H / rect.height) + offY);
    renderDiagram();
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    if (moved) touchDiagram();
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

$('#diagCanvas').addEventListener('pointerdown', (e) => {
  if (e.target !== $('#diagCanvas') && e.target.classList.contains('diag-hit')) return;
  const rect = $('#diagCanvas').getBoundingClientRect();
  const x = Math.round((e.clientX - rect.left) * (DIAG_W / rect.width));
  const y = Math.round((e.clientY - rect.top) * (DIAG_H / rect.height));
  if (diagPlace && x > 0 && y > 0) {
    placeNode(diagPlace, x, y);
    return;
  }
  if (diagConnFrom) {
    diagConnFrom = null;
    $('#diagConnect').textContent = 'Connect: off';
    $('#diagConnect').classList.remove('active');
    renderDiagram();
    return;
  }
  diagSel = null;
  diagSelZone = null;
  renderDiagram();
});

document.querySelectorAll('.diag-add').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (diagPlace === btn.dataset.type) {
      diagPlace = null;
      document.querySelectorAll('.diag-add').forEach((b) => b.classList.remove('active'));
      return;
    }
    diagPlace = btn.dataset.type;
    document.querySelectorAll('.diag-add').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    toast('Click the canvas to place a ' + btn.textContent);
  });
});

$('#diagConnect').addEventListener('click', () => {
  diagConnFrom = null;
  diagPlace = null;
  document.querySelectorAll('.diag-add').forEach((b) => b.classList.remove('active'));
  const active = !$('#diagConnect').classList.contains('active');
  $('#diagConnect').classList.toggle('active', active);
  $('#diagConnect').textContent = active ? 'Connect: click 1st node' : 'Connect: off';
});

$('#diagDelete').addEventListener('click', () => {
  if (diagSelZone) {
    const keep = diag.zones.find((zz) => zz.id === diagSelZone);
    diag.zones = diag.zones.filter((zz) => zz.id !== diagSelZone);
    diag.nodes.forEach((n) => { if (n.zone === diagSelZone) n.zone = null; });
    diagSelZone = null;
    renderDiagram();
    touchDiagram();
    toast(keep ? ('Site "' + keep.label + '" removed — devices kept on canvas') : 'Site removed');
    return;
  }
  if (!diagSel) return toast('Select a node or site first', 'warn');
  diag.nodes = diag.nodes.filter((n) => n.id !== diagSel);
  diag.links = diag.links.filter((l) => l.from !== diagSel && l.to !== diagSel);
  diagSel = null;
  renderDiagram();
  touchDiagram();
  toast('Node deleted');
});

$('#diagCanvas').addEventListener('keydown', (e) => {
  if ((e.key === 'Delete' || e.key === 'Backspace') && (diagSel || diagSelZone)) $('#diagDelete').click();
});

$('#diagAddZone').addEventListener('click', () => {
  diagPlace = null;
  document.querySelectorAll('.diag-add').forEach((b) => b.classList.remove('active'));
  addZone();
});

$('#diagZoneRename').addEventListener('click', () => {
  const z = diag.zones.find((zz) => zz.id === diagSelZone);
  if (!z) return toast('Select a site first', 'warn');
  renameZone(z);
});

$('#diagDeviceLink').addEventListener('change', (e) => {
  const id = e.target.selectedIndex > 0 ? Number(e.target.options[e.target.selectedIndex].value) : null;
  e.target.selectedIndex = 0;
  if (!id) return;
  const n = nodeById(diagSel);
  if (!n) return toast('Click a node on the canvas to select it first', 'warn');
  const dev = (window.__devicesCache || []).find((d) => d.id === id);
  if (!dev) return;
  n.device_id = dev.id;
  n.label = dev.name;
  const t = { router: 'router', switch: 'switch', server: 'server', workstation: 'pc', printer: 'printer' };
  if (t[dev.device_type]) n.type = t[dev.device_type];
  renderDiagram();
  touchDiagram();
  toast('Linked to ' + dev.name + (diagStatus[dev.id] ? ' (' + diagStatus[dev.id].toUpperCase() + ')' : ''));
});

$('#diagImport').addEventListener('click', async () => {
  const devices = await api('/api/v1/devices');
  if (!devices.length) return toast('No devices in the inventory', 'warn');
  const t = { router: 'router', switch: 'switch', server: 'server', workstation: 'pc', printer: 'printer' };
  diag.nodes = devices.map((d, i) => {
    const col = i % 4, row = Math.floor(i / 4);
    return {
      id: 'n' + d.id,
      type: t[d.device_type] || 'pc',
      label: d.name,
      x: 120 + col * 250, y: 90 + row * 130,
      device_id: d.id,
    };
  });
  diag.links = [];
  const core = diag.nodes.find((n) => n.label === 'CoreSwitch') || diag.nodes[0];
  diag.nodes.forEach((n) => { if (n.id !== core.id) diag.links.push({ from: core.id, to: n.id }); });
  renderDiagram();
  touchDiagram();
  toast('Imported ' + devices.length + ' devices');
});

$('#diagLayout').addEventListener('click', () => {
  const cx = DIAG_W / 2, cy = DIAG_H / 2;
  diag.nodes.forEach((n, i) => {
    const a = (i / Math.max(diag.nodes.length, 1)) * Math.PI * 2;
    n.x = Math.round(cx + Math.cos(a) * 250);
    n.y = Math.round(cy + Math.sin(a) * 230);
  });
  renderDiagram();
  touchDiagram();
});

/**
 * Debounce diagram saves to avoid excessive PUT requests.
 */
function touchDiagram() {
  clearTimeout(diagSaveTimer);
  diagSaveTimer = setTimeout(async () => {
    try { await api('/api/v1/diagram', { method: 'PUT', body: JSON.stringify(diag) }); }
    catch (e) { toast(e.message, 'err'); }
  }, 800);
}

$('#diagSave').addEventListener('click', async () => {
  clearTimeout(diagSaveTimer);
  try {
    await api('/api/v1/diagram', { method: 'PUT', body: JSON.stringify(diag) });
    toast('Diagram saved');
  } catch (e) { toast(e.message, 'err'); }
});

// ---------- Organization / setup ----------
let setupMode = 'welcome';   // 'welcome' | 'settings'
let orgSettings = { org_name: 'Network Management Suite' };

/**
 * Apply the organization name to the sidebar and browser title.
 * @param {string} name
 */
function applyOrgBranding(name) {
  const org = name || 'Network Management Suite';
  $('#orgName').textContent = org;
  document.title = org + ' — Network Management Suite';
}

/**
 * Show or hide the first-run setup overlay.
 * @param {'welcome'|'settings'} mode
 */
function showSetup(mode) {
  setupMode = mode;
  const welcome = mode === 'welcome';
  $('#setupDemo').closest('.setup-check').style.display = welcome ? '' : 'none';
  document.querySelector('.setup-box h1').textContent = welcome
    ? 'Network Management Suite'
    : 'Organization Settings';
  document.querySelector('.setup-box > p').textContent = welcome
    ? 'Configure your network management dashboard to get started.'
    : 'Update your organization name and settings.';
  $('#setupStart').textContent = welcome ? 'Continue' : 'Save';
  $('#setupOrg').value = welcome ? '' : (orgSettings.org_name || '');
  $('#setupScreen').hidden = false;
  $('#setupOrg').focus();
}

/**
 * Submit the setup form (org name + optional demo data).
 */
async function saveSetup() {
  try {
    const orgInput = $('#setupOrg');
    const org = orgInput.value.trim();
    
    // Validation
    if (!org) {
      toast('Please enter an organization name', 'warn');
      orgInput.focus();
      return;
    }
    
    const demo = setupMode === 'welcome' && $('#setupDemo').checked;
    const btn = $('#setupStart');
    
    // Disable button and show loading state
    btn.disabled = true;
    btn.textContent = demo ? 'Loading...' : 'Saving...';
    
    await api('/api/v1/setup', { 
      method: 'POST', 
      body: JSON.stringify({ org_name: org, demo }) 
    });
    
    // Update UI
    applyOrgBranding(org);
    orgSettings.org_name = org;
    $('#setupScreen').hidden = true;
    
    toast(demo ? 'Configuration complete' : 'Settings saved', 'ok');
    
    // Load data and navigate
    await warmCaches();
    goTab(currentTab);
    
  } catch (e) {
    console.error('Setup error:', e);
    toast('Setup failed: ' + (e.message || 'Unknown error'), 'err');
  } finally {
    const btn = $('#setupStart');
    if (btn) {
      btn.disabled = false;
      btn.textContent = setupMode === 'welcome' ? 'Continue' : 'Save';
    }
  }
}

$('#setupStart').addEventListener('click', saveSetup);
$('#setupScreen').addEventListener('click', (e) => { if (e.target === $('#setupScreen')) $('#setupStart').focus(); });
$('#setupOrg').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveSetup(); });
$('.sidebar-foot').addEventListener('click', () => showSetup('settings'));

// ---------- WebSocket & Real-Time Updates ----------

let ws = null;
let wsReconnectTimer = null;
let wsConnected = false;
const WS_RECONNECT_DELAY = 5000;

/**
 * Initialize WebSocket connection for real-time monitoring updates
 */
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  
  try {
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      wsConnected = true;
      showConnectionStatus('connected');
      
      // Clear reconnect timer if exists
      if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = null;
      }
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      wsConnected = false;
      showConnectionStatus('error');
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
      wsConnected = false;
      showConnectionStatus('disconnected');
      
      // Attempt to reconnect after delay
      wsReconnectTimer = setTimeout(() => {
        console.log('Attempting to reconnect WebSocket...');
        initWebSocket();
      }, WS_RECONNECT_DELAY);
    };
    
  } catch (error) {
    console.error('Failed to initialize WebSocket:', error);
    wsConnected = false;
  }
}

/**
 * Handle incoming WebSocket messages
 */
function handleWebSocketMessage(data) {
  console.log('WebSocket message:', data.type, data);
  
  switch (data.type) {
    case 'connected':
      console.log('WebSocket server says:', data.message);
      break;
      
    case 'device_down':
      handleDeviceDown(data.data);
      break;
      
    case 'device_up':
      handleDeviceUp(data.data);
      break;
      
    case 'monitoring_cycle_complete':
      handleMonitoringCycleComplete(data);
      break;
      
    case 'incident_created':
      handleIncidentCreated(data.data);
      break;
      
    case 'incident_resolved':
      handleIncidentResolved(data.data);
      break;
      
    default:
      console.debug('Unknown WebSocket message type:', data.type);
  }
}

/**
 * Handle device going DOWN
 */
function handleDeviceDown(alertData) {
  console.warn('DEVICE DOWN:', alertData.device_name);
  
  // Show browser notification
  showDesktopNotification(
    `Device Down: ${alertData.device_name}`,
    `${alertData.device_ip} is not responding`,
    'critical'
  );
  
  // Play alert sound
  playAlertSound('critical');
  
  // Show toast notification
  toast(`${alertData.device_name} is DOWN!`, 'err');
  
  // Add to event feed
  addEventToFeed({
    type: 'device_down',
    message: `${alertData.device_name} (${alertData.device_ip}) is DOWN`,
    severity: 'critical',
    timestamp: alertData.timestamp
  });
  
  // Update device status in current view
  updateDeviceStatus(alertData.device_id, 'down');
  
  // Refresh current tab data
  if (currentTab === 'dashboard' || currentTab === 'monitoring') {
    loadTab(currentTab);
  }
}

/**
 * Handle device coming back UP
 */
function handleDeviceUp(alertData) {
  console.info('DEVICE UP:', alertData.device_name);
  
  // Show browser notification
  showDesktopNotification(
    `Device Recovered: ${alertData.device_name}`,
    `${alertData.device_ip} is back online (${alertData.rtt_ms}ms)`,
    'success'
  );
  
  // Play recovery sound
  playAlertSound('success');
  
  // Show toast notification
  toast(`${alertData.device_name} is back UP!`, 'ok');
  
  // Add to event feed
  addEventToFeed({
    type: 'device_up',
    message: `${alertData.device_name} (${alertData.device_ip}) is back UP`,
    severity: 'info',
    timestamp: alertData.timestamp
  });
  
  // Update device status in current view
  updateDeviceStatus(alertData.device_id, 'up');
  
  // Refresh current tab data
  if (currentTab === 'dashboard' || currentTab === 'monitoring') {
    loadTab(currentTab);
  }
}

/**
 * Handle monitoring cycle completion
 */
function handleMonitoringCycleComplete(data) {
  const summary = data.summary;
  console.log(`Monitoring cycle: ${summary.up} up, ${summary.down} down (${summary.duration}ms)`);
  
  // Update monitoring status indicator
  updateMonitoringStatus(summary);
  
  // Update dashboard if visible
  if (currentTab === 'dashboard') {
    $('#dashUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString();
  }
}

/**
 * Handle incident creation
 */
function handleIncidentCreated(data) {
  console.log('Incident created:', data.incident_id);
  
  toast(`New incident #${data.incident_id}: ${data.device_name}`, 'warn');
  
  addEventToFeed({
    type: 'incident_created',
    message: `Incident #${data.incident_id} created for ${data.device_name}`,
    severity: 'warning',
    timestamp: new Date().toISOString()
  });
  
  // Update incident badge
  const badge = $('#openIssueBadge');
  const current = parseInt(badge.textContent) || 0;
  badge.textContent = current + 1;
  badge.hidden = false;
}

/**
 * Handle incident resolution
 */
function handleIncidentResolved(data) {
  console.log('Incident resolved:', data.incident_id);
  
  toast(`Incident #${data.incident_id} auto-resolved`, 'ok');
  
  addEventToFeed({
    type: 'incident_resolved',
    message: `Incident #${data.incident_id} resolved (${data.device_name})`,
    severity: 'info',
    timestamp: new Date().toISOString()
  });
  
  // Update incident badge
  const badge = $('#openIssueBadge');
  const current = parseInt(badge.textContent) || 0;
  if (current > 0) {
    badge.textContent = current - 1;
    if (current - 1 === 0) badge.hidden = true;
  }
}

/**
 * Show connection status indicator
 */
function showConnectionStatus(status) {
  let indicator = $('#wsStatus');
  if (!indicator) {
    indicator = el('div', 'ws-status');
    indicator.id = 'wsStatus';
    document.body.append(indicator);
  }
  
  indicator.className = 'ws-status ws-' + status;
  
  const messages = {
    connected: '● Live',
    disconnected: '○ Reconnecting...',
    error: '○ Connection Error'
  };
  
  indicator.textContent = messages[status] || status;
  
  // Auto-hide connected status after 3 seconds
  if (status === 'connected') {
    setTimeout(() => {
      indicator.style.opacity = '0.3';
    }, 3000);
  } else {
    indicator.style.opacity = '1';
  }
}

/**
 * Update device status in the UI
 */
function updateDeviceStatus(deviceId, status) {
  // Find device rows in tables and update status
  document.querySelectorAll(`tr[data-device-id="${deviceId}"]`).forEach(row => {
    const statusCell = row.querySelector('.device-status');
    if (statusCell) {
      statusCell.textContent = status.toUpperCase();
      statusCell.className = 'device-status status-' + status;
    }
  });
}

/**
 * Update monitoring status indicator
 */
function updateMonitoringStatus(summary) {
  const indicator = $('#monitoringStatus');
  if (!indicator) return;
  
  indicator.textContent = `${summary.up} up · ${summary.down} down`;
  indicator.className = summary.down > 0 ? 'monitoring-status status-warning' : 'monitoring-status status-ok';
}

/**
 * Show desktop notification (browser API)
 */
function showDesktopNotification(title, body, severity = 'info') {
  if (!('Notification' in window)) {
    console.warn('Desktop notifications not supported');
    return;
  }
  
  if (Notification.permission === 'granted') {
    const icon = severity === 'critical' ? '🔴' : severity === 'warning' ? '⚠️' : '✅';
    new Notification(title, {
      body: body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: 'network-monitor',
      requireInteraction: severity === 'critical'
    });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        showDesktopNotification(title, body, severity);
      }
    });
  }
}

/**
 * Play alert sound
 */
function playAlertSound(type = 'info') {
  const audioContext = window.AudioContext || window.webkitAudioContext;
  if (!audioContext) return;
  
  try {
    const ctx = new audioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    // Different tones for different alert types
    const frequencies = {
      critical: [800, 600, 800], // Descending then up (urgent)
      warning: [600, 700],        // Rising tone
      success: [400, 600, 800],   // Happy ascending
      info: [500]                 // Single tone
    };
    
    const freq = frequencies[type] || frequencies.info;
    let time = ctx.currentTime;
    
    freq.forEach((f, i) => {
      oscillator.frequency.setValueAtTime(f, time);
      gainNode.gain.setValueAtTime(0.1, time);
      gainNode.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
      time += 0.15;
    });
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(time);
    
  } catch (error) {
    console.error('Failed to play alert sound:', error);
  }
}

/**
 * Add event to live event feed
 */
const eventFeedItems = [];
const MAX_FEED_ITEMS = 50;

function addEventToFeed(event) {
  eventFeedItems.unshift({
    ...event,
    timestamp: event.timestamp || new Date().toISOString(),
    id: Date.now() + Math.random()
  });
  
  // Keep only last 50 events
  if (eventFeedItems.length > MAX_FEED_ITEMS) {
    eventFeedItems.pop();
  }
  
  // Update feed display if visible
  updateEventFeedDisplay();
}

/**
 * Update event feed display
 */
function updateEventFeedDisplay() {
  const feedContainer = $('#eventFeed');
  if (!feedContainer) return;
  
  feedContainer.replaceChildren(...eventFeedItems.slice(0, 20).map(event => {
    const item = el('div', `event-item event-${event.severity}`);
    const time = new Date(event.timestamp);
    const timeStr = time.toLocaleTimeString();
    
    const icon = {
      critical: '🔴',
      warning: '⚠️',
      info: 'ℹ️',
      success: '✅'
    }[event.severity] || '•';
    
    item.innerHTML = `
      <span class="event-time">${timeStr}</span>
      <span class="event-icon">${icon}</span>
      <span class="event-message">${event.message}</span>
    `;
    
    return item;
  }));
}

// ---------- Init ----------
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const setup = await api('/api/v1/setup?t=' + Date.now());
    
    const tab = ['dashboard', 'infrastructure', 'ipvlan', 'monitoring', 'incidents', 'diagram']
      .includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard';
    currentTab = tab;
    
    // Setup screen disabled - go straight to dashboard
    // if (!setup.configured) { 
    //   showSetup('welcome'); 
    //   return; 
    // }
    
    orgSettings = { org_name: setup.org_name || 'Network Management Suite' };
    applyOrgBranding(orgSettings.org_name);
    $('#setupScreen').hidden = true;
    await warmCaches();
    goTab(tab);
    
    // Initialize WebSocket for real-time updates
    initWebSocket();
    
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    
  } catch (e) {
    console.error('Init error:', e);
    // Even on error, show the dashboard instead of blocking
    orgSettings = { org_name: 'Network Management Suite' };
    applyOrgBranding(orgSettings.org_name);
    $('#setupScreen').hidden = true;
    goTab('dashboard');
    
    // Still try to connect WebSocket
    initWebSocket();
  }
});