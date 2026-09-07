const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt !== undefined) n.textContent = txt;
  return n;
};

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

function toast(message, type = 'ok') {
  const t = el('div', 'toast ' + type);
  t.append(el('span', '', type === 'ok' ? '✓' : type === 'err' ? '✕' : '!'), el('span', '', message));
  $('#toasts').append(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2600);
  setTimeout(() => t.remove(), 3000);
}

const fmtDate = (s) => {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z'));
  if (isNaN(d)) return s;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const fmtTime = (s) => {
  if (!s) return '—';
  const d = new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z'));
  if (isNaN(d)) return s;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const pill = (kind, label) => el('span', 'pill ' + kind, label);
const emptyRow = (colspan, message) => {
  const tr = el('tr', 'empty-row');
  const td = el('td', '', message);
  td.colSpan = colspan;
  tr.append(td);
  return tr;
};

// ---------- Tabs / navigation ----------
let currentTab = 'dashboard';

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

function loadTab(name) {
  if (name === 'dashboard') loadDashboard();
  else if (name === 'infrastructure') loadInfrastructure();
  else if (name === 'ipvlan') loadIpVlan();
  else if (name === 'monitoring') loadMonitoring();
  else if (name === 'incidents') loadIncidents();
  else if (name === 'diagram') loadDiagram();
}

// ---------- Dashboard ----------
async function loadDashboard() {
  const d = await api('/api/dashboard');
  const conflicts = await api('/api/conflicts');

  $('#dashUpdated').textContent = 'Updated ' + new Date().toLocaleTimeString();

  const badge = $('#openIssueBadge');
  if (d.counts.openIssues > 0) { badge.textContent = d.counts.openIssues; badge.hidden = false; }
  else badge.hidden = true;

  const cards = [
    { l: 'Rooms', n: d.counts.rooms, ico: '◫', cls: '' },
    { l: 'Outlets', n: d.counts.outlets, ico: '▢', cls: '' },
    { l: 'Cables active', n: d.counts.cablesActive, ico: '⌁', cls: '' },
    { l: 'Failed tests', n: d.counts.cablesFailedTest, ico: '✖', cls: d.counts.cablesFailedTest > 0 ? 'bad' : 'good' },
    { l: 'Patch panels', n: d.counts.panels, ico: '⊞', cls: '' },
    { l: 'VLANs', n: d.counts.vlans, ico: '≋', cls: '' },
    { l: 'Devices', n: d.counts.devices, ico: '▤', cls: '' },
    { l: 'Open incidents', n: d.counts.openIssues, ico: '⚠', cls: d.counts.openIssues > 0 ? 'warn' : 'good' },
  ];
  $('#dashCards').replaceChildren(...cards.map((c) => {
    const card = el('div', 'card ' + c.cls);
    card.append(el('div', 'c-ico', c.ico));
    const body = el('div');
    body.append(el('div', 'c-num', c.n), el('div', 'c-label', c.l));
    card.append(body);
    return card;
  }));

  const u = d.uptime;
  const uptime = el('div', 'cards');
  const upCard = el('div', u.down > 0 ? 'card warn' : 'card good');
  upCard.append(el('div', 'c-ico', '●'));
  const upBody = el('div'); upBody.append(el('div', 'c-num', `${u.up}/${u.total}`), el('div', 'c-label', 'Devices up'));
  upCard.append(upBody);
  const downCard = el('div', u.down > 0 ? 'card bad' : 'card good');
  downCard.append(el('div', 'c-ico', '◌'));
  const dBody = el('div'); dBody.append(el('div', 'c-num', u.down), el('div', 'c-label', 'Devices down'));
  downCard.append(dBody);
  uptime.append(upCard, downCard);
  if (u.total === 0) uptime.append(...[]);
  $('#dashUptime').replaceChildren(u.total === 0 ? el('div', 'muted', 'No monitored devices yet. Open Monitoring and run a check.') : uptime);

  $('#dashConflicts').replaceChildren(...conflictsBlock(conflicts));

  const issues = await api('/api/issues');
  const open = issues.filter((i) => i.status !== 'Resolved' && i.status !== 'Closed').slice(0, 4);
  const box = el('div');
  if (open.length === 0) box.append(el('div', 'muted', 'No open incidents. Everything is calm.'));
  open.forEach((i) => {
    const line = el('div', 'hist-line');
    line.append(pill(i.status === 'In Progress' ? 'in-progress' : i.status.toLowerCase(), i.status),
      el('span', '', '  ' + i.title));
    box.append(line);
  });
  $('#dashIssues').replaceChildren(box);
}

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
let roomsCache = [];
let outletsCache = [];
let panelsCache = [];

async function loadInfrastructure() {
  const [rooms, outlets, panels, cables] = await Promise.all([
    api('/api/rooms'), api('/api/outlets'), api('/api/patchpanels'), api('/api/cables'),
  ]);
  roomsCache = rooms; panelsCache = panels; outletsCache = outlets;

  $('#roomsBody').replaceChildren(...(rooms.length
    ? rooms.map((r) => {
        const tr = el('tr');
        tr.append(el('td', '', r.name), el('td', '', r.floor || '—'), el('td', '', r.purpose || '—'));
        const act = el('td', '');
        act.append(delBtn(() => api('/api/rooms/' + r.id, { method: 'DELETE' })));
        tr.append(act);
        return tr;
      })
    : [emptyRow(4, 'No rooms documented yet.')]));

  $('#outletsBody').replaceChildren(...(outlets.length
    ? outlets.map((o) => {
        const tr = el('tr');
        tr.append(el('td', '', o.label), el('td', '', o.location || '—'), el('td', '', o.room_name));
        const act = el('td', '');
        act.append(delBtn(() => api('/api/outlets/' + o.id, { method: 'DELETE' })));
        tr.append(act);
        return tr;
      })
    : [emptyRow(4, 'No wall outlets documented yet.')]));

  $('#panelsBody').replaceChildren(...(panels.length
    ? panels.map((p) => {
        const tr = el('tr');
        tr.append(el('td', '', p.name), el('td', '', p.location || '—'), el('td', '', p.ports));
        const act = el('td', '');
        act.append(delBtn(() => api('/api/patchpanels/' + p.id, { method: 'DELETE' })));
        tr.append(act);
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
        const act = el('td', '');
        act.append(delBtn(() => api('/api/cables/' + c.id, { method: 'DELETE' })));
        tr.append(act);
        return tr;
      })
    : [emptyRow(10, 'No cable runs logged yet. Wire it up!')]));
}

function delBtn(run) {
  const b = el('button', 'btn sm danger', 'Delete');
  b.onclick = async () => {
    try { await run(); toast('Entry deleted'); reloadCurrent(); }
    catch (e) { toast(e.message, 'err'); }
  };
  return b;
}

const testPill = (v) => v === 'Pass' ? pill('pass', 'Pass') : v === 'Fail' ? pill('fail', 'Fail') : pill('pending', v || 'Pending');
const statusPill = (v) => v === 'Active' ? pill('active', 'Active') : pill('inactive', v || '—');

// ---------- IP & VLAN ----------
let vlansCache = [];

async function loadIpVlan() {
  const [vlans, devices, conflicts] = await Promise.all([api('/api/vlans'), api('/api/devices'), api('/api/conflicts')]);
  vlansCache = vlans;

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
          el('td', '', countByVlan[v.id] || 0)
        );
        return tr;
      })
    : [emptyRow(5, 'No VLANs defined yet.')]));

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
        toggle.onchange = async () => {
          try {
            await api('/api/devices/' + d.id, { method: 'PATCH', body: JSON.stringify({ monitored: toggle.checked ? 1 : 0 }) });
            toast(d.name + ' monitoring ' + (toggle.checked ? 'enabled' : 'disabled'));
          } catch (e) { toggle.checked = !toggle.checked; toast(e.message, 'err'); }
        };
        tdM.append(toggle);
        const act = el('td', '');
        act.append(delBtn(() => api('/api/devices/' + d.id, { method: 'DELETE' })));
        tr.append(tdM, act);
        return tr;
      })
    : [emptyRow(8, 'No devices in the inventory yet.')]));
}

// ---------- Monitoring ----------
let refreshTimer = null;

async function loadMonitoring() {
  const status = await api('/api/monitor/status');
  if (status.length === 0) {
    $('#monitorBody').replaceChildren(emptyRow(8, 'No monitored devices yet. Enable monitoring on a device, or add one.'));
    return;
  }
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

async function doCheck(id, btn) {
  const orig = btn.textContent;
  btn.disabled = true;
  btn.replaceChildren(el('span', 'spinner'));
  try {
    const r = await api('/api/monitor/check/' + id, { method: 'POST' });
    toast(`${r.name} → ${r.status.toUpperCase()}${r.rttMs != null ? ' (' + r.rttMs + ' ms)' : ''}`,
      r.status === 'up' ? 'ok' : 'warn');
  } catch (e) {
    toast(e.message, 'err');
  }
  btn.disabled = false;
  btn.textContent = orig;
}

async function checkAll() {
  const btn = $('#checkAll');
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    const results = await api('/api/monitor/check-all', { method: 'POST' });
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

async function showHistory(s) {
  const hist = await api('/api/monitor/history/' + s.id);
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
async function loadIncidents() {
  const issues = await api('/api/issues');
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
        act.append(advanceBtn(i), delBtn(() => api('/api/issues/' + i.id, { method: 'DELETE' })));
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

function advanceBtn(issue) {
  const next = issue.status === 'Open' ? 'In Progress' : issue.status === 'In Progress' ? 'Resolved' : null;
  if (!next) return el('span', 'muted', '');
  const b = el('button', 'btn sm', next === 'Resolved' ? 'Resolve' : '→ In Progress');
  b.onclick = async () => {
    try {
      await api('/api/issues/' + issue.id, { method: 'PATCH', body: JSON.stringify({ status: next }) });
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

async function search(q) {
  const res = await api('/api/search?q=' + encodeURIComponent(q));
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
    box.append(el('div', 'sr-empty', `No results for “${q}”`));
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
    title: 'Add room', post: '/api/rooms',
    fields: [
      ['name', 'text', 'Room name', true], ['floor', 'text', 'Floor'],
      ['purpose', 'text', 'Purpose', false, null, 'full'],
    ],
  },
  outlets: {
    title: 'Add wall outlet', post: '/api/outlets',
    fields: [
      ['label', 'text', 'Label (e.g. A-101)', true], ['location', 'text', 'Location'],
      ['room_id', 'select', 'Room', false, () => roomsCache.map((r) => ({ v: r.id, l: r.name }))],
    ],
  },
  patchpanels: {
    title: 'Add patch panel', post: '/api/patchpanels',
    fields: [
      ['name', 'text', 'Panel name', true], ['location', 'text', 'Location'],
      ['ports', 'number', 'Ports'],
    ],
  },
  cables: {
    title: 'Add cable run', post: '/api/cables',
    fields: [
      ['cable_id', 'text', 'Cable ID', true], ['patch_port', 'text', 'Patch panel port'],
      ['outlet_id', 'select', 'Wall outlet', false, () => outletsCache.map((o) => ({ v: o.id, l: `${o.label} · ${o.room_name}` }))],
      ['patch_panel_id', 'select', 'Patch panel', false, () => panelsCache.map((p) => ({ v: p.id, l: `${p.name} · ${p.location || ''}` }))],
      ['length_m', 'number', 'Length (m)'],
      ['cable_type', 'select', 'Cable type', false, () => [{ v: 'Cat5e', l: 'Cat5e' }, { v: 'Cat6', l: 'Cat6' }, { v: 'Cat6a', l: 'Cat6a' }]],
      ['test_result', 'select', 'Test result', false, () => [{ v: 'Pending', l: 'Pending' }, { v: 'Pass', l: 'Pass' }, { v: 'Fail', l: 'Fail' }]],
      ['status', 'select', 'Status', false, () => [{ v: 'Active', l: 'Active' }, { v: 'Inactive', l: 'Inactive' }]],
      ['notes', 'text', 'Notes', false, null, 'full'],
    ],
  },
  vlans: {
    title: 'Add VLAN', post: '/api/vlans',
    fields: [
      ['vlan_id', 'number', 'VLAN ID', true], ['name', 'text', 'VLAN name', true],
      ['subnet', 'text', 'Subnet (e.g. 192.168.10.0/24)'], ['gateway', 'text', 'Gateway'],
      ['description', 'text', 'Description', false, null, 'full'],
    ],
  },
  devices: {
    title: 'Add device', post: '/api/devices',
    fields: [
      ['name', 'text', 'Device name', true], ['ip', 'text', 'IP address'],
      ['device_type', 'select', 'Device type', false, () => [
        { v: 'Router', l: 'Router' }, { v: 'Switch', l: 'Switch' },
        { v: 'Server', l: 'Server' }, { v: 'Workstation', l: 'Workstation' },
      ]],
      ['vlan_id', 'select', 'VLAN', false, () => vlansCache.map((v) => ({ v: v.id, l: `VLAN ${v.vlan_id} ${v.name}` }))],
      ['mac', 'text', 'MAC address'], ['location', 'text', 'Location'],
      ['monitored', 'select', 'Monitor', false, () => [{ v: 1, l: 'Yes' }, { v: 0, l: 'No' }]],
    ],
  },
  issues: {
    title: 'Log incident', post: '/api/issues',
    fields: [
      ['title', 'text', 'Short summary', true, null, 'full'],
      ['description', 'textarea', 'Details (symptoms, troubleshooting…)', false, null, 'full'],
      ['severity', 'select', 'Severity', false, () => [{ v: 'Low', l: 'Low' }, { v: 'Medium', l: 'Medium' }, { v: 'High', l: 'High' }]],
      ['status', 'select', 'Status', false, () => [{ v: 'Open', l: 'Open' }, { v: 'In Progress', l: 'In Progress' }, { v: 'Resolved', l: 'Resolved' }]],
      ['device_id', 'select', 'Related device (optional)', false, null],
      ['outlet_id', 'select', 'Related outlet (optional)', false, null],
      ['reporter', 'text', 'Reported by'],
    ],
  },
};

async function warmCaches() {
  const [rooms, outlets, panels, vlans, devices] = await Promise.all([
    api('/api/rooms'), api('/api/outlets'), api('/api/patchpanels'), api('/api/vlans'), api('/api/devices'),
  ]);
  roomsCache = rooms; panelsCache = panels; vlansCache = vlans; outletsCache = outlets;
  window.__devicesCache = devices;
}

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

function openModal(entity) {
  const spec = forms[entity];
  const form = $('#modalForm');
  form.replaceChildren();
  $('#modalTitle').textContent = spec.title;

  spec.fields.forEach((f) => {
    if (f[0] === 'device_id') {
      f[4] = () => (window.__devicesCache || []).map((d) => ({ v: d.id, l: `${d.name} (${d.ip || 'no IP'})` }));
    }
    if (f[0] === 'outlet_id') {
      f[4] = () => outletsCache.map((o) => ({ v: o.id, l: `${o.label} · ${o.room_name}` }));
    }
    addField(form, f);
  });

  const actions = el('div', 'modal-actions');
  const cancel = el('button', 'btn ghost', 'Cancel');
  cancel.onclick = closeModal;
  const save = el('button', 'btn primary', 'Save');
  save.onclick = async () => {
    const body = {};
    form.querySelectorAll('input, select, textarea').forEach((i) => {
      if (i.name && i.value !== '') body[i.name] = i.value;
    });
    for (const k of ['room_id', 'outlet_id', 'patch_panel_id', 'vlan_id', 'device_id', 'ports', 'length_m', 'vlan_id']) {
      if (body[k] !== undefined) body[k] = Number(body[k]);
    }
    if (body.vlan_id === '') delete body.vlan_id;
    save.disabled = true;
    try {
      await api(spec.post, { method: 'POST', body: JSON.stringify(body) });
      closeModal();
      toast('Saved');
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

function reloadCurrent() {
  loadTab(currentTab);
}

// ---------- Exports ----------
$('#content').addEventListener('click', (e) => {
  const exp = e.target.closest('[data-export]');
  if (exp) {
    const a = el('a');
    a.href = '/api/export/' + exp.dataset.export + '.csv';
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
const diag = { nodes: [], links: [] };
let diagStatus = {};               // device_id -> 'up' | 'down'
let diagSel = null;                // selected node id
let diagPlace = null;              // active type to place (or null)
let diagConnFrom = null;           // connect-mode first node id
let diagSaveTimer = null;

const DEFAULT_LABEL = { router: 'Router', switch: 'Switch', server: 'Server', pc: 'PC', printer: 'Printer', cloud: 'Internet' };

async function loadDiagram() {
  const [saved, devices, statuses] = await Promise.all([
    api('/api/diagram'), api('/api/devices'), api('/api/monitor/status'),
  ]);
  diag.nodes = saved.nodes || [];
  diag.links = saved.links || [];
  window.__devicesCache = devices;
  diagStatus = {};
  statuses.forEach((s) => { if (s.id != null) diagStatus[s.id] = s.last_status; });

  const sel = $('#diagDeviceLink');
  sel.replaceChildren();
  sel.append(new Option('Attach to device…', ''));
  devices.forEach((d) => sel.append(new Option(`${d.name}${d.ip ? ' (' + d.ip + ')' : ''}`, d.id)));

  renderDiagram();
}

function uid() { return 'n' + Math.random().toString(36).slice(2, 9); }

function nodeById(id) { return diag.nodes.find((n) => n.id === id); }

function placeNode(type, x, y) {
  const count = diag.nodes.filter((n) => n.type === type).length;
  const n = { id: uid(), type, label: (DEFAULT_LABEL[type] || type) + (count ? '-' + (count + 1) : ''), x, y, device_id: null };
  diag.nodes.push(n);
  diagSel = n.id;
  renderDiagram();
  touchDiagram();
}

function renderDiagram() {
  const svg = $('#diagCanvas');
  svg.replaceChildren(diagDefs(), diagBgRect());
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
  diagSel = n.id;
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
  if (!diagSel) return toast('Select a node first', 'warn');
  diag.nodes = diag.nodes.filter((n) => n.id !== diagSel);
  diag.links = diag.links.filter((l) => l.from !== diagSel && l.to !== diagSel);
  diagSel = null;
  renderDiagram();
  touchDiagram();
  toast('Node deleted');
});

$('#diagCanvas').addEventListener('keydown', (e) => {
  if ((e.key === 'Delete' || e.key === 'Backspace') && diagSel) $('#diagDelete').click();
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
  const devices = await api('/api/devices');
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

function touchDiagram() {
  clearTimeout(diagSaveTimer);
  diagSaveTimer = setTimeout(async () => {
    try { await api('/api/diagram', { method: 'PUT', body: JSON.stringify(diag) }); }
    catch (e) { toast(e.message, 'err'); }
  }, 800);
}

$('#diagSave').addEventListener('click', async () => {
  clearTimeout(diagSaveTimer);
  try {
    await api('/api/diagram', { method: 'PUT', body: JSON.stringify(diag) });
    toast('Diagram saved');
  } catch (e) { toast(e.message, 'err'); }
});

// ---------- Init ----------
window.addEventListener('DOMContentLoaded', async () => {
  await warmCaches();
  const tab = ['dashboard', 'infrastructure', 'ipvlan', 'monitoring', 'incidents', 'diagram']
    .includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard';
  goTab(tab);
});