/**
 * NetVisor Suite — client-side application.
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
  dashPanel(() => updateEventFeedDisplay(), 'activity');
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
  const container = $('#dashKpis');
  container.replaceChildren(...kpis.map((k) => {
    const card = el('div', 'kpi ' + (k.cls || ''));
    const top = el('div', 'kpi-top');
    const meta = el('div');
    meta.append(el('div', 'kpi-value', String(k.value)), el('div', 'kpi-label', k.label));
    top.append(el('div', 'kpi-ico', ico(k.key)), meta);
    const hint = el('div', 'kpi-hint', k.hint);
    card.append(top, hint, meterFill(k.meter, 'kpi-meter'));
    return card;
  }));
  container.classList.add('loaded');
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
  if (types.length === 0) { box.replaceChildren(el('div', 'dash-empty', 'No devices in the inventory yet.')); return; }
  const max = Math.max(...types.map((t) => Number(t.n)), 1);
  const rows = [];
  types.forEach((t) => {
    const row = el('div', 'type-row');
    const top = el('div', 'type-top');
    top.append(el('span', 'type-name', t.device_type || 'Other'), el('span', 'type-n', t.n));
    row.append(top, meterFill((Number(t.n) / max) * 100));
    rows.push(row);
  });
  box.replaceChildren(...rows);
}

/**
 * Render VLAN utilization rows with a chip, subnet, device count, and meter.
 * @param {object} d - Dashboard payload.
 */
function renderVlans(d) {
  const box = $('#dashVlans');
  const vlans = d.vlans || [];
  if (vlans.length === 0) { box.replaceChildren(el('div', 'dash-empty', 'No VLANs defined yet.')); return; }
  const max = Math.max(...vlans.map((v) => Number(v.devices)), 1);
  const rows = [];
  vlans.forEach((v) => {
    const row = el('div', 'vlan-row');
    const top = el('div', 'vlan-top');
    top.append(el('span', 'vlan-chip', 'VLAN ' + v.vlan_id), el('span', 'vlan-name', v.name));
    const meta = el('div', 'vlan-meta');
    meta.append(el('span', 'vlan-sub', v.subnet || 'no subnet'), el('span', 'vlan-count', v.devices + ' dev'));
    row.append(top, meta, meterFill((Number(v.devices) / max) * 100));
    rows.push(row);
  });
  box.replaceChildren(...rows);
}

/**
 * Render the most recent open incidents, severity-tinted.
 * @param {Array} issues - Issue records from /api/v1/issues.
 */
function renderIssues(issues) {
  const box = $('#dashIssues');
  const open = issues.filter((i) => i.status !== 'Resolved' && i.status !== 'Closed');
  if (open.length === 0) {
    box.replaceChildren(el('div', 'dash-empty', 'No open incidents — everything is calm.'));
    return;
  }
  const rows = open.slice(0, 4).map((i) => {
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
    return row;
  });
  box.replaceChildren(...rows);
}

/**
 * Render the monitored device reachability list, sorted by worst status first.
 * @param {object} d - Dashboard payload.
 */
function renderReach(d) {
  const box = $('#dashUptime');
  const u = d.uptime;
  if (u.total === 0) {
    box.replaceChildren(el('div', 'dash-empty', 'No monitored devices yet. Enable monitoring or visit the Monitoring tab.'));
    return;
  }
  const order = { down: 0, up: 1, unknown: 2 };
  const rows = [...u.monitored].sort((a, b) => order[a.status || 'unknown'] - order[b.status || 'unknown'])
    .map((m) => {
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
      return row;
    });
  box.replaceChildren(...rows);
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
    tr.setAttribute('data-device-id', s.id);
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
let diagSelLink = null;            // selected link index into diag.links
let diagPlace = null;              // active type to place (or null)
let diagConnectMode = false;       // two-click connect mode is armed
let diagConnFrom = null;           // connect-mode first node id
let diagMouse = null;              // last pointer position over the canvas (connect preview)
let diagSaveTimer = null;
let diagDemoMode = false;          // demo / practice mode
let diagZoom = 1;                  // current canvas zoom scale
let diagGridOn = true;             // show the background snap grid
let diagHistory = [];              // undo stack of diagram snapshots
let diagRedo = [];                 // redo stack of diagram snapshots
let diagFitted = false;            // whether the initial zoom-fit has run
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 3;
const SNAP = 24;                   // snap-to-grid size (diagram units)
const DIAG_HISTORY_LIMIT = 60;

const DEFAULT_LABEL = {
  router: 'Router', switch: 'Switch', hub: 'Hub', bridge: 'Bridge',
  wireless: 'Access Point', modem: 'Modem', firewall: 'Firewall',
  server: 'Server', pc: 'PC', laptop: 'Laptop', printer: 'Printer',
  phone: 'Phone', tablet: 'Tablet', cloud: 'Internet',
};
const LINK_TYPES = new Set(['copper', 'fiber', 'wireless', 'console', 'serial']);

/** Map inventory device_type -> diagram node type. */
const DEV_TYPE_TO_NODE = {
  router: 'router', switch: 'switch', server: 'server', hub: 'hub', firewall: 'firewall',
  workstation: 'pc', pc: 'pc', laptop: 'laptop', phone: 'phone',
  printer: 'printer', accesspoint: 'wireless', ap: 'wireless', modem: 'modem',
};

/** Connection type selected for the next link (defaults to copper). */
function currentLinkType() {
  const s = $('#diagLinkType');
  return s && LINK_TYPES.has(s.value) ? s.value : 'copper';
}

/** Toggle demo mode on/off. */
function setDemoMode(on) {
  diagDemoMode = on;
  if (on) {
    resetConnectMode();
    diagSelLink = null;
    diagSel = null;
    diagSelZone = null;
  }
  const editBtn = $('#diagModeEdit');
  const demoBtn = $('#diagModeDemo');
  const panel = $('#diagDemoPanel');
  if (editBtn) editBtn.setAttribute('aria-pressed', String(!on));
  if (demoBtn) demoBtn.setAttribute('aria-pressed', String(on));
  if (panel) panel.hidden = !on;
  if (!on) clearTrace();
}

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
  diagHistory = [];
  diagRedo = [];
  diagSel = null;
  diagSelZone = null;
  diagSelLink = null;
  diagMouse = null;
  resetConnectMode();
  window.__devicesCache = devices;
  diagStatus = {};
  statuses.forEach((s) => { if (s.id != null) diagStatus[s.id] = s.last_status; });

  const sel = $('#diagDeviceLink');
  sel.replaceChildren();
  sel.append(new Option('Attach to device…', ''));
  devices.forEach((d) => sel.append(new Option(`${d.name}${d.ip ? ' (' + d.ip + ')' : ''}`, d.id)));

  refreshTraceOptions();
  populateDiagPropControls();
  renderDiagram();
  if (!diagFitted && (diag.nodes.length || diag.zones.length)) {
    diagFitted = true;
    zoomFit();
  }
}

/** Clear trace output and reset demo state. */
function clearTrace() {
  const out = $('#diagTraceOutput');
  if (out) out.replaceChildren();
  const from = $('#diagTraceFrom');
  const to = $('#diagTraceTo');
  if (from) from.value = '';
  if (to) to.value = '';
}

let diagTraceSig = '';

/**
 * Refresh the Demo/Trace source + destination dropdowns to match
 * the current set of canvas nodes. Rebuilds only when the set changes.
 */
function refreshTraceOptions() {
  const from = $('#diagTraceFrom');
  const to = $('#diagTraceTo');
  if (!from || !to) return;
  const sig = diag.nodes.map((n) => (n.label || '') + '\u0000' + n.id).join('|');
  if (sig === diagTraceSig) return;
  diagTraceSig = sig;
  const keepF = from.value;
  const keepT = to.value;
  [from, to].forEach((sel) => {
    sel.replaceChildren(new Option('Select node…', ''));
    diag.nodes.forEach((n) => sel.append(new Option(n.label || n.id, n.id)));
  });
  from.value = keepF;
  to.value = keepT;
}

/** Esc cancels connect/place modes or clears the current selection. */
function diagCancelMode() {
  if (diagConnectMode) { resetConnectMode(); renderDiagram(); return; }
  if (diagSelLink != null || diagSel || diagSelZone) {
    diagSelLink = null;
    diagSel = null;
    diagSelZone = null;
    renderDiagram();
  }
}

/** Run a simulated trace / ping between two diagram nodes. */
async function runTrace() {
  const fromId = $('#diagTraceFrom')?.value;
  const toId = $('#diagTraceTo')?.value;
  const out = $('#diagTraceOutput');
  if (!out) return;
  if (!fromId || !toId) { out.replaceChildren(el('div', 'diag-trace-line trace-fail', 'Select source and destination nodes.')); return; }
  if (fromId === toId) { out.replaceChildren(el('div', 'diag-trace-line trace-fail', 'Source and destination are the same.')); return; }
  const fromNode = nodeById(fromId);
  const toNode = nodeById(toId);
  if (!fromNode || !toNode) { out.replaceChildren(el('div', 'diag-trace-line trace-fail', 'One of the selected nodes was not found.')); return; }

  out.replaceChildren();
  const add = (text, cls = 'trace-info') => { const d = el('div', 'diag-trace-line ' + cls, text); out.append(d); };
  add(`Trace from ${fromNode.label || fromId} → ${toNode.label || toId}`);
  add('Resolving route...');

  await sleep(350);
  const path = findPath(fromId, toId);
  if (!path) { add('Destination unreachable from current topology.', 'trace-fail'); return; }
  add(`Path found (${path.length} hops): ${path.map((id) => (nodeById(id)?.label || id)).join(' → ')}`, 'trace-ok');
  for (const hopId of path) {
    const n = nodeById(hopId);
    const st = statusFor(n);
    await sleep(220);
    add(`[${st.toUpperCase()}] ${n?.label || hopId}${n?.ip ? ' (' + n.ip + ')' : ''}`, st === 'up' ? 'trace-ok' : 'trace-fail');
  }
  add('Trace complete.', 'trace-ok');
}

/** Breadth-first search for a path between two node ids. */
function findPath(fromId, toId) {
  const adj = new Map();
  diag.links.forEach((l) => {
    const a = l.from, b = l.to;
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  });
  const queue = [[fromId]];
  const visited = new Set([fromId]);
  while (queue.length) {
    const path = queue.shift();
    const last = path[path.length - 1];
    if (last === toId) return path;
    for (const next of (adj.get(last) || [])) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push([...path, next]);
    }
  }
  return null;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** Snap a coordinate to the diagram grid. */
function snap(v) { return Math.round(v / SNAP) * SNAP; }

/** Resize the SVG element to the current zoom level. */
function applyZoom() {
  const svg = $('#diagCanvas');
  if (!svg) return;
  svg.style.width = Math.round(DIAG_W * diagZoom) + 'px';
  svg.style.height = Math.round(DIAG_H * diagZoom) + 'px';
  const z = $('#diagZoomLabel');
  if (z) z.textContent = Math.round(diagZoom * 100) + '%';
}

/** Set zoom (clamped), keeping the point under px,py stable when provided. */
function setZoom(z, px, py) {
  const scroll = $('#diagScroll');
  const prev = diagZoom;
  diagZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  const f = diagZoom / prev;
  if (px !== undefined && py !== undefined && scroll && f !== 1) {
    scroll.scrollLeft += (px * f - px);
    scroll.scrollTop += (py * f - py);
  }
  applyZoom();
}

/** Zoom so the entire diagram (nodes + zones) is visible inside the scroll area. */
function zoomFit() {
  const scroll = $('#diagScroll');
  if (!scroll) { setZoom(1); return; }
  const nodes = diag.nodes;
  const zones = diag.zones;
  if (!nodes.length && !zones.length) {
    setZoom(1);
    scroll.scrollLeft = 0;
    scroll.scrollTop = 0;
    return;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  zones.forEach((z) => {
    minX = Math.min(minX, z.x); minY = Math.min(minY, z.y);
    maxX = Math.max(maxX, z.x + z.w); maxY = Math.max(maxY, z.y + z.h);
  });
  nodes.forEach((n) => {
    minX = Math.min(minX, n.x - 90); minY = Math.min(minY, n.y - 90);
    maxX = Math.max(maxX, n.x + 90); maxY = Math.max(maxY, n.y + 90);
  });
  const cw = Math.max(scroll.clientWidth - 48, 240);
  const ch = Math.max(scroll.clientHeight - 48, 240);
  const bw = Math.max(maxX - minX, 200);
  const bh = Math.max(maxY - minY, 200);
  setZoom(Math.min(Math.min(cw / bw, ch / bh), 1.5));
  const contentW = (maxX - minX) * diagZoom;
  const contentH = (maxY - minY) * diagZoom;
  scroll.scrollLeft = Math.max(0, Math.round(minX * diagZoom - (cw - contentW) / 2));
  scroll.scrollTop = Math.max(0, Math.round(minY * diagZoom - (ch - contentH) / 2));
}

/** Toggle the background grid on/off. */
function setGrid(on) {
  diagGridOn = on;
  const btn = $('#diagGridToggle');
  if (btn) btn.classList.toggle('active', on);
  renderDiagram();
}

// ---- History (undo / redo) ----

/** Deep snapshot of the current diagram state (nodes, links, zones). */
function historySnapshot() {
  return {
    nodes: JSON.parse(JSON.stringify(diag.nodes)),
    links: JSON.parse(JSON.stringify(diag.links)),
    zones: JSON.parse(JSON.stringify(diag.zones)),
  };
}

/** Push a snapshot onto the undo stack. Pass a pre-mutation snapshot for drags. */
function recordHistory(snapshot) {
  diagHistory.push(snapshot || historySnapshot());
  if (diagHistory.length > DIAG_HISTORY_LIMIT) diagHistory.shift();
  diagRedo = [];
  updateHistoryButtons();
}

function updateHistoryButtons() {
  const u = $('#diagUndo');
  const r = $('#diagRedo');
  if (u) u.disabled = !diagHistory.length;
  if (r) r.disabled = !diagRedo.length;
}

function undoDiagram() {
  if (!diagHistory.length) { toast('Nothing to undo', 'warn'); return; }
  diagRedo.push(historySnapshot());
  const prev = diagHistory.pop();
  diag.nodes = prev.nodes;
  diag.links = prev.links;
  diag.zones = prev.zones;
  diagSel = null;
  diagSelZone = null;
  renderDiagram();
  touchDiagram();
  toast('Undo', 'ok');
}

function redoDiagram() {
  if (!diagRedo.length) { toast('Nothing to redo', 'warn'); return; }
  diagHistory.push(historySnapshot());
  const next = diagRedo.pop();
  diag.nodes = next.nodes;
  diag.links = next.links;
  diag.zones = next.zones;
  diagSel = null;
  diagSelZone = null;
  renderDiagram();
  touchDiagram();
  toast('Redo', 'ok');
}

/** Refresh the little node/link/site up/down summary in the diagram header. */
function renderDiagStats() {
  const st = $('#diagStats');
  if (!st) return;
  let up = 0, down = 0;
  diag.nodes.forEach((n) => {
    const s = statusFor(n);
    if (s === 'up') up++;
    else if (s === 'down') down++;
  });
  st.innerHTML =
    '<span class="ds ds-node">' + diag.nodes.length + ' nodes</span>' +
    '<span class="ds ds-link">' + diag.links.length + ' links</span>' +
    '<span class="ds ds-zone">' + diag.zones.length + ' sites</span>' +
    '<span class="ds ds-up">' + up + ' up</span>' +
    '<span class="ds ds-down">' + down + ' down</span>';
}

/** Update the auto-save status pill. */
function setSaveStatus(msg, kind) {
  const s = $('#diagSaveStatus');
  if (!s) return;
  s.textContent = msg;
  s.className = 'diag-save-status' + (kind ? ' ' + kind : '');
}

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
  recordHistory();
  x = snap(x);
  y = snap(y);
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
  if (diagSelLink != null && !diag.links[diagSelLink]) diagSelLink = null;
  const svg = $('#diagCanvas');
  svg.replaceChildren(diagDefs(), diagBgRect());
  diag.zones.forEach((z) => svg.appendChild(zoneGroup(z)));
  diag.links.forEach((l, i) => {
    const linkGroup = diagLinkEl(l, i);
    if (linkGroup) svg.appendChild(linkGroup);
  });
  if (diagConnectMode && diagConnFrom) {
    const src = nodeById(diagConnFrom);
    if (src) {
      const pv = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      pv.id = 'diagPreview';
      pv.setAttribute('x1', src.x); pv.setAttribute('y1', src.y);
      pv.setAttribute('x2', (diagMouse && diagMouse.x) || src.x);
      pv.setAttribute('y2', (diagMouse && diagMouse.y) || src.y);
      pv.classList.add('diag-preview');
      svg.appendChild(pv);
    }
  }
  diag.nodes.forEach((n) => svg.appendChild(nodeGroup(n)));
  const rename = $('#diagZoneRename');
  if (rename) rename.disabled = !diagSelZone;
  renderNodeProps();
  applyZoom();
  renderDiagStats();
  refreshTraceOptions();
  updateHistoryButtons();
  const empty = $('#diagEmpty');
  if (empty) empty.hidden = diagDemoMode || diag.nodes.length > 0 || diag.zones.length > 0;
}

/** Build an SVG group for a link: a wide invisible "hit" line for easy
 *  selection on top of the styled line, tinted by the connection type. */
function diagLinkEl(l, i) {
  const a = nodeById(l.from);
  const b = nodeById(l.to);
  if (!a || !b) return null;
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  g.classList.add('diag-link-g');
  if (i === diagSelLink) g.classList.add('sel');

  const type = LINK_TYPES.has(l.type) ? l.type : 'copper';
  const line = document.createElementNS(ns, 'line');
  line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
  line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
  line.classList.add('diag-link', 'lk-' + type);
  if (l.label) {
    const title = document.createElementNS(ns, 'title');
    title.textContent = l.label + ' — ' + type;
    line.appendChild(title);
  }
  g.appendChild(line);

  const tip = document.createElementNS(ns, 'title');
  tip.textContent = `${a.label || a.id} ⇄ ${b.label || b.id} · ${type} — click to select`;
  g.appendChild(tip);

  const hit = document.createElementNS(ns, 'line');
  hit.setAttribute('x1', a.x); hit.setAttribute('y1', a.y);
  hit.setAttribute('x2', b.x); hit.setAttribute('y2', b.y);
  hit.classList.add('diag-link-hit');
  hit.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (diagConnectMode || diagPlace) return;
    selectNode(null);
    diagSel = null;
    diagSelZone = null;
    diagSelLink = i;
    renderDiagram();
  });
  g.appendChild(hit);
  return g;
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
  rect.classList.add('diag-bg');
  rect.classList.toggle('grid', diagGridOn);
  return rect;
}

const ZONE_COUNTS = {
  router: 'Router', switch: 'Switch', hub: 'Hub', bridge: 'Bridge',
  wireless: 'Access Point', modem: 'Modem', firewall: 'Firewall',
  server: 'Server', pc: 'PC', laptop: 'Laptop', printer: 'Printer',
  phone: 'Phone', tablet: 'Tablet', cloud: 'Internet',
};

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
 * Build the SVG group for a zone (site/office/city rectangle).
 * @param {{id: string, label: string, x: number, y: number, w: number, h: number, city: string, building: string}} z
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

  const locationText = [z.building, z.city].filter(Boolean).join(' · ') || '';
  if (locationText) {
    const loc = mk('text', { x: z.x + 14, y: z.y + 40, 'text-anchor': 'start' }, 'zone-sub');
    loc.textContent = locationText;
    loc.setAttribute('fill', 'var(--muted)');
    loc.setAttribute('font-size', '10.5px');
    loc.setAttribute('font-weight', '600');
    loc.setAttribute('user-select', 'none');
    loc.setAttribute('pointer-events', 'none');
    g.appendChild(loc);
  }

  const count = mk('text', { x: z.x + 14, y: z.y + z.h - 14, 'text-anchor': 'start' }, 'zone-count');
  count.textContent = zoneCountText(z) || '';
  g.appendChild(count);

  const hit = mk('rect', { x: z.x, y: z.y, width: z.w, height: z.h }, 'zone-hit');
  hit.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (diagConnectMode) { resetConnectMode(); renderDiagram(); return; }
    if (diagPlace) {
      const rect = $('#diagCanvas').getBoundingClientRect();
      placeNode(diagPlace,
        Math.round((e.clientX - rect.left) * (DIAG_W / rect.width)),
        Math.round((e.clientY - rect.top) * (DIAG_H / rect.height)));
      return;
    }
    diagSelLink = null;
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
  const before = historySnapshot();
  let moved = false;
  const move = (ev) => {
    moved = true;
    const nx = Math.round((ev.clientX - rect.left) * (DIAG_W / rect.width) + offX);
    const ny = Math.round((ev.clientY - rect.top) * (DIAG_H / rect.height) + offY);
    const zx = Math.max(0, Math.min(snap(nx), DIAG_W - z.w));
    const zy = Math.max(0, Math.min(snap(ny), DIAG_H - z.h));
    const dx = zx - z.x, dy = zy - z.y;
    z.x = zx; z.y = zy;
    diag.nodes.forEach((n) => { if (n.zone === z.id) { n.x += dx; n.y += dy; } });
    renderDiagram();
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    if (moved) { recordHistory(before); touchDiagram(); }
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

function startZoneResize(z) {
  const svg = $('#diagCanvas');
  const rect = svg.getBoundingClientRect();
  const sx = z.x, sy = z.y;
  const before = historySnapshot();
  const move = (ev) => {
    const mx = Math.min(Math.round((ev.clientX - rect.left) * (DIAG_W / rect.width)), DIAG_W);
    const my = Math.min(Math.round((ev.clientY - rect.top) * (DIAG_H / rect.height)), DIAG_H);
    z.w = Math.max(96, snap(mx) - sx);
    z.h = Math.max(96, snap(my) - sy);
    renderDiagram();
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    recordHistory(before);
    touchDiagram();
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

function addZone() {
  recordHistory();
  const z = { id: 'z' + uid(), label: 'New site', x: 70, y: 70, w: 320, h: 180, room_id: null, city: '', building: '' };
  diag.zones.push(z);
  selectZone(z.id);
  renderDiagram();
  touchDiagram();
  renameZone(z);
}

/**
 * Prompt the user to rename a zone label.
 * @param {{id: string, label: string, city: string, building: string}} z
 */
function renameZone(z) {
  if (!z) return;
  const name = prompt('Site / office / city name:', z.label || '');
  if (name && name.trim()) {
    recordHistory();
    z.label = name.trim();
    const city = prompt('City / region (optional):', z.city || '');
    if (city !== null) z.city = city.trim();
    const building = prompt('Building / floor (optional):', z.building || '');
    if (building !== null) z.building = building.trim();
    renderDiagram();
    populateDiagPropControls();
    touchDiagram();
  }
}

/**
 * Build the SVG group for a single node (device shape + label + hit area).
 * @param {{id: string, type: string, label: string, x: number, y: number, device_id: number|null}} n
 * @returns {SVGGElement}
 */
function nodeGroup(n) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(svgNS, 'g');
  g.setAttribute('transform', `translate(${n.x}, ${n.y})`);
  g.setAttribute('data-id', n.id);
  g.classList.add('diag-node');
  if (n.id === diagSel) g.classList.add('sel');
  if (n.id === diagConnFrom) g.classList.add('conn-src');

  const shape = document.createElementNS(svgNS, 'g');
  shape.classList.add('shape', 't-' + n.type);
  const st = statusFor(n);
  shape.classList.add('st-' + st);
  drawShape(shape, n.type);
  g.appendChild(shape);

  const led = document.createElementNS(svgNS, 'circle');
  led.setAttribute('cx', '22'); led.setAttribute('cy', '-20'); led.setAttribute('r', '4');
  led.setAttribute('stroke', 'var(--bg)'); led.setAttribute('stroke-width', '1.5');
  led.classList.add('led', 'led-' + st);
  led.appendChild(ledTitle(st));
  g.appendChild(led);

  const hit = document.createElementNS(svgNS, 'rect');
  hit.setAttribute('x', '-30'); hit.setAttribute('y', '-26'); hit.setAttribute('width', '60'); hit.setAttribute('height', '52');
  hit.classList.add('diag-hit');
  g.appendChild(hit);

  const label = document.createElementNS(svgNS, 'text');
  label.setAttribute('y', '40'); label.setAttribute('text-anchor', 'middle');
  label.classList.add('diag-label');
  label.textContent = n.label || '';
  g.appendChild(label);

  const dev = n.device_id != null ? ((window.__devicesCache || []).find((d) => d.id === n.device_id)) : null;
  const ip = n.ip || (dev && dev.ip) || '';
  if (ip) {
    const sub = document.createElementNS(svgNS, 'text');
    sub.setAttribute('y', '55'); sub.setAttribute('text-anchor', 'middle');
    sub.classList.add('diag-sub');
    sub.textContent = ip;
    g.appendChild(sub);
  }

  g.addEventListener('pointerdown', (e) => { e.stopPropagation(); pickNode(n, e); });
  g.addEventListener('dblclick', (e) => { e.stopPropagation(); renameNode(n); });
  return g;
}

/** Effective status for a node: live device status wins, else its stored status. */
function statusFor(n) {
  if (n && n.device_id != null && diagStatus[n.device_id]) return diagStatus[n.device_id];
  return (n && n.status) || 'unknown';
}

/** Add a tooltip caption to the status LED. */
function ledTitle(st) {
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  t.textContent = (st === 'up' ? 'Online' : st === 'down' ? 'Offline' : 'Status unknown');
  return t;
}

/** Rename a node via a prompt (Packet-Tracer style double-click rename). */
function renameNode(n) {
  if (!n) return;
  if (diagConnectMode) return;
  const name = prompt('Node name:', n.label || '');
  if (name && name.trim()) {
    recordHistory();
    n.label = name.trim();
    renderDiagram();
    touchDiagram();
  }
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
  } else if (type === 'laptop') {
    mk('rect', { x: -17, y: -12, width: 34, height: 21, rx: 2 });
    mk('path', { d: 'M-12 12 h24 l3 4 h-30 z' });
  } else if (type === 'phone') {
    mk('rect', { x: -8, y: -18, width: 16, height: 32, rx: 3 });
    mk('line', { x1: -4, y1: 10, x2: 4, y2: 10 });
  } else if (type === 'tablet') {
    mk('rect', { x: -11, y: -15, width: 22, height: 29, rx: 3 });
    mk('line', { x1: -5, y1: 11, x2: 5, y2: 11 });
  } else if (type === 'firewall') {
    mk('rect', { x: -18, y: -14, width: 36, height: 28, rx: 2 });
    mk('line', { x1: -18, y1: -3, x2: 18, y2: -3 });
    mk('line', { x1: -18, y1: 9, x2: 18, y2: 9 });
    mk('line', { x1: -6, y1: -14, x2: -6, y2: -3 });
    mk('line', { x1: 6, y1: -3, x2: 6, y2: 9 });
  } else if (type === 'hub') {
    mk('rect', { x: -14, y: -9, width: 28, height: 18, rx: 3 });
    mk('circle', { cx: -8, cy: 0, r: 1.8 });
    mk('circle', { cx: -2.5, cy: 0, r: 1.8 });
    mk('circle', { cx: 2.5, cy: 0, r: 1.8 });
    mk('circle', { cx: 8, cy: 0, r: 1.8 });
  } else if (type === 'bridge') {
    mk('rect', { x: -14, y: -8, width: 28, height: 16, rx: 2 });
    mk('line', { x1: 0, y1: -8, x2: 0, y2: 8 });
    mk('circle', { cx: -8, cy: 0, r: 1.6 });
    mk('circle', { cx: 8, cy: 0, r: 1.6 });
  } else if (type === 'wireless') {
    mk('path', { d: 'M-15 0 A 14 14 0 0 1 15 0' });
    mk('path', { d: 'M-10 -5 A 9 9 0 0 1 10 -5' });
    mk('path', { d: 'M-5 -9 A 4 4 0 0 1 5 -9' });
    mk('line', { x1: 0, y1: 0, x2: 0, y2: 6 });
  } else if (type === 'modem') {
    mk('rect', { x: -18, y: -10, width: 36, height: 20, rx: 2 });
    mk('circle', { cx: -12, cy: 0, r: 3 });
    mk('circle', { cx: -4, cy: 0, r: 3 });
    mk('line', { x1: 5, y1: -6, x2: 14, y2: -6 });
    mk('line', { x1: 5, y1: 0, x2: 14, y2: 0 });
    mk('line', { x1: 5, y1: 6, x2: 14, y2: 6 });
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
  if (diagDemoMode) {
    const from = $('#diagTraceFrom');
    const to = $('#diagTraceTo');
    if (!from || !to) return;
    const sameNode = from.value === n.id || to.value === n.id;
    if (sameNode) {
      from.value = '';
      to.value = '';
      renderDiagram();
      toast('Trace reset — click the source node again', 'warn');
      return;
    }
    if (!from.value) {
      from.value = n.id;
      renderDiagram();
      toast('Trace source: ' + (n.label || n.id) + ' — now click the destination', 'ok');
      return;
    }
    if (!to.value) {
      to.value = n.id;
      renderDiagram();
      runTrace();
      return;
    }
    from.value = n.id;
    to.value = '';
    renderDiagram();
    toast('Trace source: ' + (n.label || n.id) + ' — now click the destination', 'ok');
    return;
  }
  if (diagConnectMode) {
    if (!diagConnFrom) {
      diagConnFrom = n.id;                 // 1st click: remember the source
      diagSelLink = null;
      selectNode(n.id);
      renderDiagram();
      setConnectMode(true);
      toast('Now click the second node to create the link', 'ok');
      return;
    }
    if (diagConnFrom === n.id) {
      renderDiagram();
      toast('Pick a different node to connect to', 'warn');
      return;
    }
    const dup = diag.links.some((l) =>
      (l.from === diagConnFrom && l.to === n.id) || (l.from === n.id && l.to === diagConnFrom));
    const ltype = currentLinkType();
    if (dup) {
      toast('These nodes are already connected', 'warn');
    } else {
      recordHistory();
      diag.links.push({ from: diagConnFrom, to: n.id, type: ltype });
      touchDiagram();
      toast('Connected (' + ltype + ')');
    }
    diagConnFrom = null;                    // stay in connect mode to wire more pairs
    renderDiagram();
    setConnectMode(true);
    return;
  }
  selectNode(n.id);
  diagSelLink = null;
  renderDiagram();
  startDrag(n, e);
}

/** Toggle the connect-mode button label/state. */
function setConnectMode(active) {
  diagConnectMode = active;
  const btn = $('#diagConnect');
  if (!btn) return;
  btn.classList.toggle('active', active);
  btn.textContent = !active ? 'Connect' : (diagConnFrom ? 'Connect: click 2nd node' : 'Connect: click 1st node');
}

/** Leave connect/place modes and clear their active styling. */
function resetConnectMode() {
  diagConnFrom = null;
  diagConnectMode = false;
  diagPlace = null;
  document.querySelectorAll('.diag-add').forEach((b) => b.classList.remove('active'));
  setConnectMode(false);
}

function startDrag(n, e) {
  const svg = $('#diagCanvas');
  const rect = svg.getBoundingClientRect();
  const offX = n.x - (e.clientX - rect.left) * (DIAG_W / rect.width);
  const offY = n.y - (e.clientY - rect.top) * (DIAG_H / rect.height);
  const before = historySnapshot();
  let moved = false;
  const move = (ev) => {
    moved = true;
    n.x = snap(Math.round((ev.clientX - rect.left) * (DIAG_W / rect.width) + offX));
    n.y = snap(Math.round((ev.clientY - rect.top) * (DIAG_H / rect.height) + offY));
    renderDiagram();
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    if (moved) { recordHistory(before); touchDiagram(); }
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

$('#diagCanvas').addEventListener('pointerdown', (e) => {
  if (e.target !== $('#diagCanvas') && e.target.classList.contains('diag-hit')) return;
  const rect = $('#diagCanvas').getBoundingClientRect();
  const x = Math.round((e.clientX - rect.left) * (DIAG_W / rect.width));
  const y = Math.round((e.clientY - rect.top) * (DIAG_H / rect.height));
  if (diagDemoMode) {
    clearTrace();
    renderDiagram();
    return;
  }
  if (diagPlace && x > 0 && y > 0) {
    placeNode(diagPlace, x, y);
    return;
  }
  if (diagConnectMode) {
    resetConnectMode();
    renderDiagram();
    return;
  }
  diagSel = null;
  diagSelZone = null;
  diagSelLink = null;
  renderDiagram();
});

$('#diagCanvas').addEventListener('pointermove', (e) => {
  if (!diagConnectMode || !diagConnFrom) return;
  const rect = $('#diagCanvas').getBoundingClientRect();
  const x = Math.round((e.clientX - rect.left) * (DIAG_W / rect.width));
  const y = Math.round((e.clientY - rect.top) * (DIAG_H / rect.height));
  diagMouse = { x, y };
  const pv = $('#diagPreview');
  if (pv) { pv.setAttribute('x2', x); pv.setAttribute('y2', y); }
});

$('#diagCanvas').addEventListener('pointerleave', () => { diagMouse = null; });

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
  const next = !diagConnectMode;
  diagConnFrom = null;
  diagPlace = null;
  if (next) diagSelLink = null;
  document.querySelectorAll('.diag-add').forEach((b) => b.classList.remove('active'));
  setConnectMode(next);
  renderDiagram();
  if (next) toast('Connect mode on — click the first node, then the second', 'ok');
});

$('#diagLinkType').addEventListener('change', () => {
  const li = diag.links[diagSelLink];
  if (!li) return;
  recordHistory();
  li.type = currentLinkType();
  renderDiagram();
  touchDiagram();
  toast('Link type changed to ' + li.type);
});

$('#diagDelete').addEventListener('click', () => {
  if (diagSelLink != null) {
    recordHistory();
    diag.links.splice(diagSelLink, 1);
    diagSelLink = null;
    renderDiagram();
    touchDiagram();
    toast('Link removed');
    return;
  }
  if (diagSelZone) {
    recordHistory();
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
  recordHistory();
  diag.nodes = diag.nodes.filter((n) => n.id !== diagSel);
  diag.links = diag.links.filter((l) => l.from !== diagSel && l.to !== diagSel);
  diagSel = null;
  renderDiagram();
  touchDiagram();
  toast('Node deleted');
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
  recordHistory();
  n.device_id = dev.id;
  n.label = dev.name;
  if (DEV_TYPE_TO_NODE[dev.device_type]) n.type = DEV_TYPE_TO_NODE[dev.device_type];
  renderDiagram();
  touchDiagram();
  toast('Linked to ' + dev.name + (diagStatus[dev.id] ? ' (' + diagStatus[dev.id].toUpperCase() + ')' : ''));
});

$('#diagImport').addEventListener('click', async () => {
  const devices = await api('/api/v1/devices');
  if (!devices.length) return toast('No devices in the inventory', 'warn');
  const existing = diag.nodes.length + diag.links.length + diag.zones.length;
  if (existing > 0 && !confirm('Add the inventory devices to the current diagram, keeping existing nodes and links?')) return;
  recordHistory();
  const byDevice = new Map(diag.nodes.filter((n) => n.device_id != null).map((n) => [n.device_id, n]));
  const placed = [];
  devices.forEach((d, i) => {
    if (byDevice.has(d.id)) return;
    const col = i % 4, row = Math.floor(i / 4);
    const n = {
      id: 'n' + d.id,
      type: DEV_TYPE_TO_NODE[d.device_type] || 'pc',
      label: d.name,
      x: 120 + col * 250, y: 90 + row * 130,
      device_id: d.id,
      status: 'unknown',
    };
    diag.nodes.push(n);
    byDevice.set(d.id, n);
    placed.push(n);
  });
  if (!placed.length) {
    diagHistory.pop();
    renderDiagram();
    return toast('All inventory devices are already on the canvas');
  }
  const core = diag.nodes.find((n) => n.label === 'CoreSwitch') || diag.nodes[0];
  placed.forEach((n) => { if (n.id !== core.id) diag.links.push({ from: core.id, to: n.id, type: 'copper' }); });
  renderDiagram();
  touchDiagram();
  toast('Imported ' + placed.length + (existing ? ' new devices' : ' devices'));
});

$('#diagLayout').addEventListener('click', () => {
  recordHistory();
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
  setSaveStatus('Saving…');
  diagSaveTimer = setTimeout(async () => {
    try {
      await api('/api/v1/diagram', { method: 'PUT', body: JSON.stringify(diag) });
      setSaveStatus('Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 'ok');
    } catch (e) {
      setSaveStatus('Save failed', 'err');
      toast(e.message, 'err');
    }
  }, 800);
}

$('#diagSave').addEventListener('click', async () => {
  clearTimeout(diagSaveTimer);
  setSaveStatus('Saving…');
  try {
    await api('/api/v1/diagram', { method: 'PUT', body: JSON.stringify(diag) });
    setSaveStatus('Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 'ok');
    toast('Diagram saved');
  } catch (e) {
    setSaveStatus('Save failed', 'err');
    toast(e.message, 'err');
  }
});

$('#diagModeEdit').addEventListener('click', () => setDemoMode(false));
$('#diagModeDemo').addEventListener('click', () => setDemoMode(true));
$('#diagTraceRun').addEventListener('click', runTrace);
$('#diagTraceClear').addEventListener('click', clearTrace);

// ---- View tools (zoom, grid) ----

$('#diagZoomIn').addEventListener('click', () => setZoom(diagZoom * 1.25));
$('#diagZoomOut').addEventListener('click', () => setZoom(diagZoom / 1.25));
$('#diagZoomFit').addEventListener('click', zoomFit);
$('#diagGridToggle').addEventListener('click', () => setGrid(!diagGridOn));

$('#diagScroll').addEventListener('wheel', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  e.preventDefault();
  const rect = $('#diagCanvas').getBoundingClientRect();
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  setZoom(diagZoom * factor, e.clientX - rect.left, e.clientY - rect.top);
}, { passive: false });

// ---- History buttons ----

$('#diagUndo').addEventListener('click', undoDiagram);
$('#diagRedo').addEventListener('click', redoDiagram);

// ---- Export / print ----

/** Collect the diagram-relevant CSS rules from the page stylesheets. */
function cssForDiagram() {
  const keep = [];
  const want = [':root', '.diag-', '.shape', '.led', '.zone-', '.lk-', '.leg'];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules) {
      if (r && r.selectorText && want.some((w) => r.selectorText.includes(w))) keep.push(r.cssText);
    }
  }
  return keep.join('\n');
}

/** Serialize the current canvas plus its styles into a standalone SVG string. */
function diagramSvgText() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = $('#diagCanvas').cloneNode(true);
  svg.removeAttribute('style');
  svg.setAttribute('xmlns', NS);
  svg.setAttribute('width', DIAG_W);
  svg.setAttribute('height', DIAG_H);
  svg.setAttribute('viewBox', '0 0 ' + DIAG_W + ' ' + DIAG_H);
  const style = document.createElementNS(NS, 'style');
  style.textContent = cssForDiagram();
  svg.insertBefore(style, svg.firstChild);
  return new XMLSerializer().serializeToString(svg);
}

function downloadBlob(name, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function exportDiagramSvg() {
  let xml;
  try { xml = diagramSvgText(); } catch (e) { toast('SVG export failed: ' + e.message, 'err'); return; }
  downloadBlob('network-diagram.svg', xml, 'image/svg+xml');
  toast('Exported diagram as SVG');
}

function exportDiagramPng() {
  let xml;
  try { xml = diagramSvgText(); } catch (e) { toast('PNG export failed: ' + e.message, 'err'); return; }
  const img = new Image();
  img.onload = () => {
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = DIAG_W * scale;
    canvas.height = DIAG_H * scale;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#131f36';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => downloadBlob('network-diagram.png', blob, 'image/png'), 'image/png');
  };
  img.onerror = () => toast('PNG export failed (image could not be rendered)', 'err');
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
}

function printDiagram() {
  let xml;
  try { xml = diagramSvgText(); } catch (e) { toast('Print failed: ' + e.message, 'err'); return; }
  const w = window.open('', '_blank', 'width=1100,height=760');
  if (!w) { toast('Pop-up blocked — allow pop-ups to print', 'warn'); return; }
  const stamp = (orgSettings.org_name || 'NetVisor Suite') + ' — Network diagram · ' + new Date().toLocaleString();
  w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Network Diagram</title>' +
    '<style>@media print{body{margin:0}} body{background:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px} svg{max-width:100%;height:auto} .stamp{color:#555;font-size:12px;margin:14px 0 0}</style>' +
    '</head><body>' + xml + '<p class="stamp">' + stamp + '</p>' +
    '<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 350); };</script></body></html>');
  w.document.close();
}

$('#diagExportSvg').addEventListener('click', exportDiagramSvg);
$('#diagExportPng').addEventListener('click', exportDiagramPng);
$('#diagPrint').addEventListener('click', printDiagram);

// ---- Empty-state quick actions ----
$('#diagEmptyImport').addEventListener('click', () => $('#diagImport').click());
$('#diagEmptyZone').addEventListener('click', () => { $('#diagAddZone').click(); });

// ---- Diagram keyboard shortcuts ----
$('#diagCanvas').addEventListener('keydown', (e) => {
  if ((e.key === 'Delete' || e.key === 'Backspace') && (diagSel || diagSelZone || diagSelLink != null)) $('#diagDelete').click();
  else if (e.key === 'Escape') diagCancelMode();
  else if (e.key === '+' || e.key === '=') setZoom(diagZoom * 1.25);
  else if (e.key === '-' || e.key === '_') setZoom(diagZoom / 1.25);
  else if (e.key === '0') setZoom(1);
});

document.addEventListener('keydown', (e) => {
  const t = e.target;
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  const mod = e.ctrlKey || e.metaKey;
  if (currentTab !== 'diagram' || typing) return;
  const key = e.key.toLowerCase();
  if (mod && key === 'z') {
    e.preventDefault();
    if (e.shiftKey) redoDiagram(); else undoDiagram();
  } else if (mod && key === 'y') {
    e.preventDefault();
    redoDiagram();
  } else if (mod && (key === 's')) {
    e.preventDefault();
    $('#diagSave').click();
  } else if (key === 'escape') {
    diagCancelMode();
  }
});

// ---------- Node properties panel (Packet-Tracer style config) ----------

/** Populate the type + device dropdowns of the properties panel. */
function populateDiagPropControls() {
  const typeSel = $('#diagPropType');
  if (typeSel && !typeSel.options.length) {
    Object.keys(DEFAULT_LABEL).forEach((t) => typeSel.append(new Option(DEFAULT_LABEL[t], t)));
  }
  const devSel = $('#diagPropDevice');
  if (devSel) {
    devSel.replaceChildren(new Option('— none (draw-only) —', ''));
    (window.__devicesCache || []).forEach((d) => devSel.append(new Option(d.name, d.id)));
  }
  const zoneSel = $('#diagPropZone');
  if (zoneSel) {
    zoneSel.replaceChildren();
    zoneSel.append(new Option('— none —', ''));
    (diag.zones || []).forEach((z) => zoneSel.append(new Option(z.label || 'Site', z.id)));
  }
}

/** Reflect the currently selected node into the properties panel. */
function renderNodeProps() {
  const panel = $('#diagProps');
  if (!panel) { if (diagSel) diagSel = null; return; }
  const n = nodeById(diagSel);
  if (!n) { panel.hidden = true; return; }
  panel.hidden = false;
  $('#diagPropType').value = n.type;
  $('#diagPropLabel').value = n.label || '';
  $('#diagPropIp').value = n.ip || '';
  $('#diagPropMac').value = n.mac || '';
  $('#diagPropStatus').value = n.status || 'unknown';
  $('#diagPropDevice').value = n.device_id != null ? String(n.device_id) : '';
  const zoneSel = $('#diagPropZone');
  if (zoneSel) {
    zoneSel.replaceChildren();
    zoneSel.append(new Option('— none —', ''));
    (diag.zones || []).forEach((z) => zoneSel.append(new Option(z.label || 'Site', z.id)));
    zoneSel.value = n.zone || '';
  }
}

/** Push edited property values back into the node and persist (no re-render). */
function syncNodeFromProps() {
  const n = nodeById(diagSel);
  if (!n) return;
  const typeSel = $('#diagPropType');
  const stSel = $('#diagPropStatus');
  const devSel = $('#diagPropDevice');
  if (typeSel && DEFAULT_LABEL[typeSel.value]) n.type = typeSel.value;
  n.label = ($('#diagPropLabel').value || '').trim();
  n.ip = ($('#diagPropIp').value || '').trim();
  n.mac = ($('#diagPropMac').value || '').trim();
  if (stSel && ['up', 'down', 'unknown'].includes(stSel.value)) n.status = stSel.value;
  if (devSel) n.device_id = devSel.value ? Number(devSel.value) : null;
  const zoneSel = $('#diagPropZone');
  if (zoneSel) n.zone = zoneSel.value || null;
  touchDiagram();
}

/** Apply property changes and redraw the canvas (used on commit/blur). */
function commitNodeProps() {
  recordHistory();
  syncNodeFromProps();
  renderDiagram();
}

['#diagPropType', '#diagPropStatus', '#diagPropDevice'].forEach((sel) => $(sel).addEventListener('change', commitNodeProps));
['#diagPropLabel', '#diagPropIp', '#diagPropMac'].forEach((sel) => $(sel).addEventListener('input', syncNodeFromProps));
['#diagPropLabel', '#diagPropIp', '#diagPropMac'].forEach((sel) => $(sel).addEventListener('change', commitNodeProps));
$('#diagPropDelete').addEventListener('click', () => { $('#diagDelete').click(); });

// ---------- Organization ----------
let orgSettings = { org_name: 'NetVisor Suite' };

/**
 * Apply the organization name to the sidebar and browser title.
 * @param {string} name
 */
function applyOrgBranding(name) {
  const org = name || 'NetVisor Suite';
  $('#orgName').textContent = org;
  document.title = org + ' — NetVisor Suite';
}

// ---------- Data & Templates ----------

function openDataModal() {
  $('#dataOrgName').value = orgSettings.org_name || '';
  $('#dataModal').classList.add('show');
  setTimeout(() => $('#dataOrgName').focus(), 60);
  renderTemplates();
}

function closeDataModal() {
  $('#dataModal').classList.remove('show');
}

let templateCache = [];

async function renderTemplates() {
  const list = $('#templateList');
  try {
    const setup = await api('/api/v1/setup?t=' + Date.now());
    templateCache = setup.templates || [];
  } catch {
    templateCache = [];
  }
  if (!templateCache.length) {
    list.innerHTML = '<p class="muted">No templates are available.</p>';
    return;
  }
  list.innerHTML = templateCache.map((t, i) => `
    <div class="data-row">
      <div>
        <strong>${i + 1}. ${t.name}</strong>
        <p class="muted">${t.tagline}</p>
        <p class="muted" style="margin-top:4px;font-size:11.5px;">${t.rooms} rooms · ${t.outlets} outlets · ${t.vlans} VLANs · ${t.devices} devices</p>
      </div>
      <button class="btn primary" data-template="${t.id}" type="button">Load</button>
    </div>`).join('');
}

async function saveOrgName() {
  const org = $('#dataOrgName').value.trim();
  if (!org) return toast('Please enter an organization name', 'warn');
  try {
    await api('/api/v1/setup', {
      method: 'POST',
      body: JSON.stringify({ org_name: org })
    });
    orgSettings.org_name = org;
    applyOrgBranding(org);
    toast('Organization name saved', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function applyTemplate(templateKey) {
  const tpl = templateCache.find((t) => t.id === templateKey);
  const label = tpl ? tpl.name : 'this template';
  const okay = confirm('This replaces all current data with the "' + label + '" template. Continue?');
  if (!okay) return;
  const btn = document.querySelector(`[data-template="${templateKey}"]`);
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Loading...'; }
    await api('/api/v1/setup', {
      method: 'POST',
      body: JSON.stringify({ org_name: orgSettings.org_name || '', template: templateKey })
    });
    await warmCaches();
    goTab(currentTab);
    toast('"' + label + '" template loaded', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Load'; }
  }
}

async function resetBlank() {
  const okay = confirm('This clears all current data for a blank workspace. Continue?');
  if (!okay) return;
  const btn = $('#dataBlank');
  try {
    btn.disabled = true;
    btn.textContent = 'Resetting...';
    await api('/api/v1/setup', {
      method: 'POST',
      body: JSON.stringify({ org_name: orgSettings.org_name || '', clear: true })
    });
    await warmCaches();
    goTab(currentTab);
    toast('Blank workspace ready', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Reset to blank';
  }
}

$('#btnTemplates').addEventListener('click', openDataModal);
$('#dataModalClose').addEventListener('click', closeDataModal);
$('#dataModal').addEventListener('click', (e) => { if (e.target === $('#dataModal')) closeDataModal(); });
$('#dataModal').addEventListener('click', (e) => {
  const loadBtn = e.target.closest('[data-template]');
  if (loadBtn) applyTemplate(loadBtn.dataset.template);
});
$('#dataOrgName').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveOrgName(); });
$('#dataBlank').addEventListener('click', resetBlank);

// ---------- WebSocket & Real-Time Updates ----------

let ws = null;
let wsReconnectTimer = null;
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
      console.warn('WebSocket connected');
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
      showConnectionStatus('error');
    };
    
    ws.onclose = () => {
      console.warn('WebSocket disconnected');
      showConnectionStatus('disconnected');
      
      // Attempt to reconnect after delay
      wsReconnectTimer = setTimeout(() => {
        console.warn('Attempting to reconnect WebSocket...');
        initWebSocket();
      }, WS_RECONNECT_DELAY);
    };
    
  } catch (error) {
    console.error('Failed to initialize WebSocket:', error);
  }
}

/**
 * Handle incoming WebSocket messages
 */
function handleWebSocketMessage(data) {
  console.warn('WebSocket message:', data.type, data);
  
  switch (data.type) {
    case 'connected':
      console.warn('WebSocket server says:', data.message);
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
      console.warn('Unknown WebSocket message type:', data.type);
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
  
  // Refresh current tab data and diagram LEDs
  diagStatus[alertData.device_id] = 'down';
  if (currentTab === 'dashboard' || currentTab === 'monitoring') {
    loadTab(currentTab);
  } else if (currentTab === 'diagram') {
    renderDiagram();
  }
}

/**
 * Handle device coming back UP
 */
function handleDeviceUp(alertData) {
  console.warn('DEVICE UP:', alertData.device_name);
  
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
  
  // Refresh current tab data and diagram LEDs
  diagStatus[alertData.device_id] = 'up';
  if (currentTab === 'dashboard' || currentTab === 'monitoring') {
    loadTab(currentTab);
  } else if (currentTab === 'diagram') {
    renderDiagram();
  }
}

/**
 * Handle monitoring cycle completion
 */
function handleMonitoringCycleComplete(data) {
  const summary = data.summary;
  console.warn(`Monitoring cycle: ${summary.up} up, ${summary.down} down (${summary.duration}ms)`);
  
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
  console.warn('Incident created:', data.incident_id);
  
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
  console.warn('Incident resolved:', data.incident_id);
  
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
  document.querySelectorAll(`tr[data-device-id="${deviceId}"]`).forEach((row) => {
    const statusCell = row.querySelector('.device-status');
    if (statusCell) {
      statusCell.textContent = status.toUpperCase();
      statusCell.className = 'device-status status-' + status;
    }
    const pillEl = row.querySelector('.pill');
    if (pillEl) {
      const label = status === 'up' ? 'UP' : status === 'down' ? 'DOWN' : 'Never checked';
      pillEl.textContent = label;
      pillEl.className = 'pill ' + (status === 'up' ? 'up' : status === 'down' ? 'down' : 'pending');
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
    
    freq.forEach((f) => {
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

  if (eventFeedItems.length === 0) {
    feedContainer.replaceChildren(el('div', 'dash-empty', 'No activity yet — toggle device monitoring to see live events.'));
    return;
  }

  feedContainer.replaceChildren(...eventFeedItems.slice(0, 20).map((event) => {
    const item = el('div', `event-item event-${event.severity}`);
    const time = new Date(event.timestamp);
    const timeStr = time.toLocaleTimeString();

    const icon = {
      critical: '🔴',
      warning: '⚠️',
      info: 'ℹ️',
      success: '✅',
    }[event.severity] || '•';

    item.append(
      el('span', 'event-time', timeStr),
      el('span', 'event-icon', icon),
      el('span', 'event-message', event.message)
    );

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

    orgSettings = { org_name: setup.org_name || 'NetVisor Suite' };
    applyOrgBranding(orgSettings.org_name);
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
    orgSettings = { org_name: 'NetVisor Suite' };
    applyOrgBranding(orgSettings.org_name);
    goTab('dashboard');
    
    // Still try to connect WebSocket
    initWebSocket();
  }
});