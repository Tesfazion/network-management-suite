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
  if (!res.ok) throw new Error((await res.json()).error || res.statusText);
  return res.json();
}

// ------ Tabs ------
$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  btn.classList.add('active');
  $('#' + btn.dataset.tab).classList.add('active');
  loadTab(btn.dataset.tab);
});

function loadTab(name) {
  if (name === 'dashboard') loadDashboard();
  if (name === 'infrastructure') loadInfrastructure();
  if (name === 'ipvlan') loadIpVlan();
  if (name === 'monitoring') loadMonitoring();
}

// ------ Dashboard ------
async function loadDashboard() {
  const d = await api('/api/dashboard');
  const cards = [
    { n: d.counts.rooms, l: 'Rooms', cls: '' },
    { n: d.counts.outlets, l: 'Outlets', cls: '' },
    { n: d.counts.cablesActive, l: 'Cables (Active)', cls: '' },
    { n: d.counts.cablesFailedTest, l: 'Cables Failed', cls: d.counts.cablesFailedTest > 0 ? 'bad' : 'good' },
    { n: d.counts.panels, l: 'Patch Panels', cls: '' },
    { n: d.counts.vlans, l: 'VLANs', cls: '' },
    { n: d.counts.devices, l: 'Devices', cls: '' },
  ];
  $('#dashCards').replaceChildren(...cards.map(c => {
    const div = el('div', 'card ' + c.cls);
    div.append(el('div', 'num', c.n), el('div', 'label', c.l));
    return div;
  }));
  const u = d.uptime;
  const mini = el('div');
  if (u.total === 0) mini.textContent = 'No monitored devices yet. Go to Monitoring and run a check.';
  else mini.append(
    el('span', 'up', `▲ ${u.up} up `),
    el('span', 'down', `▼ ${u.down} down · `),
    el('span', '', `${u.total} monitored`)
  );
  $('#dashUptime').replaceChildren(mini);
}

// ------ Infrastructure ------
let roomsCache = [];
let panelsCache = [];

async function loadInfrastructure() {
  const [rooms, outlets, panels, cables] = await Promise.all([
    api('/api/rooms'), api('/api/outlets'), api('/api/patchpanels'), api('/api/cables'),
  ]);
  roomsCache = rooms; panelsCache = panels;

  $('#roomsBody').replaceChildren(...rooms.map(r => {
    const tr = el('tr');
    tr.append(el('td', '', r.name), el('td', '', r.floor || '—'), el('td', '', r.purpose || '—'));
    const td = el('td');
    const del = el('button', 'btn sm danger', 'Delete');
    del.onclick = async () => { await api('/api/rooms/' + r.id, { method: 'DELETE' }); loadInfrastructure(); };
    td.append(del); tr.append(td);
    return tr;
  }));

  $('#outletsBody').replaceChildren(...outlets.map(o => {
    const tr = el('tr');
    tr.append(el('td', '', o.label), el('td', '', o.location || '—'), el('td', '', o.room_name));
    const td = el('td');
    const del = el('button', 'btn sm danger', 'Delete');
    del.onclick = async () => { await api('/api/outlets/' + o.id, { method: 'DELETE' }); loadInfrastructure(); };
    td.append(del); tr.append(td);
    return tr;
  }));

  $('#panelsBody').replaceChildren(...panels.map(p => {
    const tr = el('tr');
    tr.append(el('td', '', p.name), el('td', '', p.location || '—'), el('td', '', p.ports));
    const td = el('td');
    const del = el('button', 'btn sm danger', 'Delete');
    del.onclick = async () => { await api('/api/patchpanels/' + p.id, { method: 'DELETE' }); loadInfrastructure(); };
    td.append(del); tr.append(td);
    return tr;
  }));

  $('#cablesBody').replaceChildren(...cables.map(c => {
    const tr = el('tr');
    tr.append(
      el('td', '', c.cable_id),
      el('td', '', c.outlet_label || '—'),
      el('td', '', c.room_name || '—'),
      el('td', '', c.panel_name || '—'),
      el('td', '', c.patch_port || '—'),
      el('td', '', c.cable_type),
      el('td', '', mkBadge('test', c.test_result)),
      el('td', '', mkBadge('status', c.status))
    );
    const td = el('td');
    const del = el('button', 'btn sm danger', 'Delete');
    del.onclick = async () => { await api('/api/cables/' + c.id, { method: 'DELETE' }); loadInfrastructure(); };
    td.append(del); tr.append(td);
    return tr;
  }));
}

function mkBadge(kind, val) {
  const b = el('span', 'badge ' + (val || '').toLowerCase());
  b.textContent = val || '—';
  return b;
}

// ------ IP / VLAN ------
async function loadIpVlan() {
  const [vlans, devices] = await Promise.all([api('/api/vlans'), api('/api/devices')]);

  $('#vlansBody').replaceChildren(...vlans.map(v => {
    const tr = el('tr');
    tr.append(el('td', '', v.vlan_id), el('td', '', v.name), el('td', '', v.subnet || '—'), el('td', '', v.gateway || '—'));
    return tr;
  }));

  $('#devicesBody').replaceChildren(...devices.map(d => {
    const tr = el('tr');
    const mon = el('span', 'badge ' + (d.monitored ? 'up' : 'pending'), d.monitored ? 'Yes' : 'No');
    tr.append(el('td', '', d.name), el('td', '', d.ip), el('td', '', d.device_type || '—'));
    const tdV = el('td', '', d.vlan_number ? `VLAN ${d.vlan_number}` + (d.vlan_name ? ' (' + d.vlan_name + ')' : '') : '—');
    const tdM = el('td', '', ''); tdM.append(mon);
    const td = el('td');
    const del = el('button', 'btn sm danger', 'Delete');
    del.onclick = async () => { await api('/api/devices/' + d.id, { method: 'DELETE' }); loadIpVlan(); };
    td.append(del);
    tr.append(tdV, tdM, td);
    return tr;
  }));
}

// ------ Monitoring ------
async function loadMonitoring() {
  const status = await api('/api/monitor/status');
  $('#monitorBody').replaceChildren(...status.map(s => {
    const tr = el('tr');
    const st = el('span', 'badge ' + (s.last_status || 'pending'), s.last_status ? (s.last_status === 'up' ? 'UP' : 'DOWN') : '—');
    const tdSt = el('td', '', ''); tdSt.append(st);
    const histBtn = el('button', 'btn sm', 'View history');
    histBtn.onclick = () => showHistory(s);
    const tdH = el('td', '', ''); tdH.append(histBtn);
    const tdChk = el('td', '', '—');
    const checkBtn = el('button', 'btn sm primary', 'Check');
    checkBtn.onclick = async () => { await doCheck(s.id); loadMonitoring(); };
    tdChk.append(checkBtn);
    tr.append(
      el('td', '', s.name), el('td', '', s.ip), el('td', '', s.device_type || '—'),
      tdSt,
      el('td', '', s.last_rtt != null ? s.last_rtt + ' ms' : '—'),
      el('td', '', s.last_checked || '—'),
      tdH,
      tdChk
    );
    return tr;
  }));
}

async function doCheck(id) {
  $('#monitorMsg').textContent = 'Checking…';
  const r = await api('/api/monitor/check/' + id, { method: 'POST' });
  $('#monitorMsg').textContent = `${r.name} → ${r.status.toUpperCase()} (${r.rttMs ?? 'no reply'} ms)`;
}

async function checkAll() {
  $('#monitorMsg').textContent = 'Checking all devices…';
  $('#checkAll').disabled = true;
  const results = await api('/api/monitor/check-all', { method: 'POST' });
  $('#checkAll').disabled = false;
  const up = results.filter(r => r.status === 'up').length;
  $('#monitorMsg').textContent = `Done: ${up} up, ${results.length - up} down.`;
  loadMonitoring();
}

$('#checkAll').addEventListener('click', checkAll);

async function showHistory(s) {
  const hist = await api('/api/monitor/history/' + s.id);
  const pane = $('#historyPane');
  pane.style.display = 'block';
  pane.replaceChildren(el('h4', '', `History — ${s.name} (${s.ip})`));
  hist.forEach(h => {
    const line = el('div', 'hist-line',
      `${h.checked_at}  ${h.status.toUpperCase()}  ${h.rtt_ms != null ? h.rtt_ms + ' ms' : '—'}`);
    line.style.color = h.status === 'up' ? '#4ade80' : '#f87171';
    pane.append(line);
  });
}

// ------ Modal forms ------
const forms = {
  rooms: {
    name: 'Add Room', fields: [
      ['name', 'text', 'Room name', true], ['floor', 'text', 'Floor'], ['purpose', 'text', 'Purpose'],
    ], post: '/api/rooms',
  },
  outlets: {
    name: 'Add Wall Outlet', fields: [
      ['label', 'text', 'Label (e.g. A-101)', true], ['location', 'text', 'Location'],
      ['room_id', 'select', 'Room'],
    ], post: '/api/outlets',
  },
  patchpanels: {
    name: 'Add Patch Panel', fields: [
      ['name', 'text', 'Panel name', true], ['location', 'text', 'Location'], ['ports', 'number', 'Ports'],
    ], post: '/api/patchpanels',
  },
  cables: {
    name: 'Add Cable Run', fields: [
      ['cable_id', 'text', 'Cable ID', true], ['patch_port', 'text', 'Patch panel port'],
      ['outlet_id', 'select', 'Wall outlet'], ['patch_panel_id', 'select', 'Patch panel'],
      ['length_m', 'number', 'Length (m)'], ['cable_type', 'select', 'Cable type', [{ v: 'Cat5e', l: 'Cat5e' }, { v: 'Cat6', l: 'Cat6' }, { v: 'Cat6a', l: 'Cat6a' }]],
      ['test_result', 'select', 'Test result', [{ v: 'Pending', l: 'Pending' }, { v: 'Pass', l: 'Pass' }, { v: 'Fail', l: 'Fail' }]],
      ['status', 'select', 'Status', [{ v: 'Active', l: 'Active' }, { v: 'Inactive', l: 'Inactive' }]],
      ['notes', 'text', 'Notes'],
    ], post: '/api/cables',
  },
  vlans: {
    name: 'Add VLAN', fields: [
      ['vlan_id', 'number', 'VLAN ID', true], ['name', 'text', 'VLAN name', true],
      ['subnet', 'text', 'Subnet (e.g. 192.168.10.0/24)'], ['gateway', 'text', 'Gateway'], ['description', 'text', 'Description'],
    ], post: '/api/vlans',
  },
  devices: {
    name: 'Add Device', fields: [
      ['name', 'text', 'Device name', true], ['ip', 'text', 'IP address'],
      ['device_type', 'select', 'Device type', [{ v: 'Router', l: 'Router' }, { v: 'Switch', l: 'Switch' }, { v: 'Server', l: 'Server' }, { v: 'Workstation', l: 'Workstation' }]],
      ['vlan_id', 'select', 'VLAN'],
      ['mac', 'text', 'MAC'], ['location', 'text', 'Location'],
      ['monitored', 'select', 'Monitor'],
    ], post: '/api/devices',
  },
};

let vlansCache = [];

function openModal(entity) {
  const spec = forms[entity];
  const form = $('#modalForm');
  form.replaceChildren();
  $('#modalTitle').textContent = spec.name;

  const addField = (name, cfg) => {
    const l = el('label', '', cfg.label);
    if (cfg.required) l.appendChild(el('span', '', ' *'));
    let input;
    if (cfg.options) {
      input = el('select');
      cfg.options.forEach(o => input.append(new Option(o.l, o.v)));
    } else {
      input = el('input');
      if (cfg.type === 'number') input.type = 'number';
      if (cfg.placeholder) input.placeholder = cfg.placeholder;
    }
    input.name = name;
    l.append(input);
    form.append(l);
  };

  const joinOptions = {
    room_id: () => roomsCache.map(r => ({ v: r.id, l: r.name })),
    outlet_id: () => outletsCache.map(o => ({ v: o.id, l: o.label })),
    patch_panel_id: () => panelsCache.map(p => ({ v: p.id, l: p.name })),
    vlan_id: () => vlansCache.map(v => ({ v: v.id, l: `VLAN ${v.vlan_id} (${v.name})` })),
    monitored: () => [{ v: '1', l: 'Yes' }, { v: '0', l: 'No' }],
  };

  spec.fields.forEach(f => {
    const [name, type, label, required, opts] = f;
    if (joinOptions[name]) {
      addField(name, { label, required: false, options: joinOptions[name]() });
    } else if (opts) {
      addField(name, { label, required, options: opts });
    } else {
      addField(name, { label, required, type });
    }
  });

  const actions = el('div', 'modal-actions');
  const cancel = el('button', 'btn', 'Cancel');
  cancel.onclick = () => $('#modal').classList.remove('show');
  const save = el('button', 'btn primary', 'Save');
  save.onclick = async () => {
    const body = {};
    form.querySelectorAll('input, select').forEach(i => {
      if (i.name && i.value !== '') body[i.name] = i.value;
    });
    ['room_id', 'outlet_id', 'patch_panel_id', 'vlan_id', 'ports', 'length_m'].forEach(k => {
      if (body[k] !== undefined && body[k] !== '') body[k] = Number(body[k]);
    });
    try {
      await api(spec.post, { method: 'POST', body: JSON.stringify(body) });
      $('#modal').classList.remove('show');
      loadTab($('.tab.active').dataset.tab);
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };
  actions.append(cancel, save);
  form.append(actions);
  $('#modal').classList.add('show');
}

let outletsCache = [];

$('#content').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-entity]');
  if (!btn) return;
  openModal(btn.dataset.entity);
});

async function warmCaches() {
  const [rooms, outlets, panels, vlans] = await Promise.all([
    api('/api/rooms'), api('/api/outlets'), api('/api/patchpanels'), api('/api/vlans'),
  ]);
  roomsCache = rooms; panelsCache = panels; vlansCache = vlans;
  outletsCache = outlets;
}

window.addEventListener('DOMContentLoaded', async () => {
  await warmCaches();
  loadDashboard();
});