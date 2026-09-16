const ORG_ID = '00000000-0000-0000-0000-000000000001';

const DELETE_ORDER = ['diagram', 'monitor_history', 'monitoring_history', 'issues', 'cables', 'devices', 'outlets', 'patch_panels', 'vlans', 'rooms'];

const DEVICE_NODE_TYPE = {
  Router: 'router', Switch: 'switch', Server: 'server', Workstation: 'pc',
  Printer: 'printer', 'Access Point': 'wireless', accesspoint: 'wireless', AP: 'wireless',
  Firewall: 'firewall', Laptop: 'laptop', Phone: 'phone', Tablet: 'tablet'
};

const TEMPLATES = {
  office: {
    id: 'office',
    name: 'Office Department',
    tagline: 'Admin + ICT offices sharing core infrastructure. The classic starter network.',
    rooms: [
      { key: 'admin', name: 'Admin Office', floor: '1', purpose: 'Administration' },
      { key: 'ict', name: 'ICT/Networking Office', floor: '1', purpose: 'Networking & Software Development' },
      { key: 'server', name: 'Server Room', floor: '1', purpose: 'Core infrastructure' },
    ],
    outlets: [
      { key: 'a101', room: 'admin', label: 'A-101', location: 'Wall Outlet 1' },
      { key: 'a102', room: 'admin', label: 'A-102', location: 'Wall Outlet 2' },
      { key: 'b201', room: 'ict', label: 'B-201', location: 'Wall Outlet 1' },
      { key: 'b202', room: 'ict', label: 'B-202', location: 'Wall Outlet 2' },
      { key: 's301', room: 'server', label: 'S-301', location: 'Server Rack Outlet' },
    ],
    patchPanel: { name: 'Core Patch Panel', location: 'Server Room Rack 1', ports: 24 },
    cables: [
      { id: 'A-101', outlet: 'a101', port: '1', len: 15, type: 'Cat6', notes: 'Admin office outlet 1' },
      { id: 'A-102', outlet: 'a102', port: '2', len: 15, type: 'Cat6', notes: 'Admin office outlet 2' },
      { id: 'B-201', outlet: 'b201', port: '3', len: 12, type: 'Cat6', notes: 'ICT office outlet 1' },
      { id: 'B-202', outlet: 'b202', port: '4', len: 12, type: 'Cat6', notes: 'Retested after re-crimp' },
      { id: 'S-301', outlet: 's301', port: '5', len: 3, type: 'Cat6', notes: 'Server rack uplink' },
    ],
    vlans: [
      { key: 'admin', vlan_id: 10, name: 'Admin', subnet: '192.168.10.0/24', gateway: '192.168.10.1', description: 'Administrative staff network' },
      { key: 'ict', vlan_id: 20, name: 'ICT_Networking', subnet: '192.168.20.0/24', gateway: '192.168.20.1', description: 'Networking and software development unit' },
      { key: 'infra', vlan_id: 99, name: 'Infrastructure', subnet: '192.168.99.0/24', gateway: '192.168.99.1', description: 'Network device management' },
    ],
    devices: [
      { name: 'Router', ip: '192.168.99.1', type: 'Router', vlan: 'infra', mac: '00:1A:2B:3C:4D:00', location: 'Server Room', monitored: 1 },
      { name: 'CoreSwitch', ip: '192.168.99.2', type: 'Switch', vlan: 'infra', mac: '00:1A:2B:3C:4D:01', location: 'Server Room', monitored: 1 },
      { name: 'AccessSwitchA', ip: '192.168.99.3', type: 'Switch', vlan: 'infra', mac: '00:1A:2B:3C:4D:02', location: 'Server Room', monitored: 1 },
      { name: 'AdminPC-01', ip: '192.168.10.10', type: 'Workstation', vlan: 'admin', mac: '00:1A:2B:3C:4D:11', location: 'Admin Office', monitored: 1 },
      { name: 'ICT-PC-01', ip: '192.168.20.10', type: 'Workstation', vlan: 'ict', mac: '00:1A:2B:3C:4D:21', location: 'ICT Office', monitored: 1 },
      { name: 'FileServer', ip: '192.168.10.50', type: 'Server', vlan: 'admin', mac: '00:1A:2B:3C:4D:30', location: 'Server Room', monitored: 1 },
      { name: 'WEB-SRV-01', ip: '192.168.10.60', type: 'Server', vlan: 'admin', mac: '00:1A:2B:3C:4D:31', location: 'Server Room', monitored: 1 },
      { name: 'Printer-01', ip: '192.168.20.25', type: 'Printer', vlan: 'ict', mac: '00:1A:2B:3C:4D:40', location: 'ICT Office', monitored: 0 },
      { name: 'Printer-02', ip: '192.168.20.26', type: 'Printer', vlan: 'ict', mac: '00:1A:2B:3C:4D:41', location: 'ICT Office', monitored: 0 },
      { name: 'HR-PC-01', ip: '192.168.10.30', type: 'Workstation', vlan: 'admin', mac: '00:1A:2B:3C:4D:50', location: 'Admin Office', monitored: 0 },
    ],
    issues: [
      { title: 'File server unreachable from Admin Office', description: 'Users report they cannot open shared folders. FileServer does not respond to ping from VLAN 10.', severity: 'High', status: 'Open', device: 'FileServer', outlet: 'a102' },
      { title: 'Slow internet on ICT office', description: 'Connectivity is slow and intermittent on outlet B-201. Suspected faulty cable or wall outlet.', severity: 'Medium', status: 'In Progress', device: 'ICT-PC-01', outlet: 'b201' },
      { title: 'Printer offline', description: 'Printer-01 not detected on the network. Possibly related to power cycling during maintenance.', severity: 'Low', status: 'Resolved', device: 'Printer-01', outlet: null },
    ],
  },

  campus: {
    id: 'campus',
    name: 'School / University Campus',
    tagline: 'Library, ICT lab, staff offices, and a server room with student/staff VLANs.',
    rooms: [
      { key: 'library', name: 'Library', floor: '1', purpose: 'Reading and research space' },
      { key: 'lab', name: 'ICT Lab', floor: '2', purpose: 'Computer lab for students' },
      { key: 'staff', name: 'Staff Office', floor: '1', purpose: 'Staff administration' },
      { key: 'server', name: 'Server Room', floor: '1', purpose: 'Core infrastructure' },
    ],
    outlets: [
      { key: 'lib1', room: 'library', label: 'L-101', location: 'Wall Outlet 1' },
      { key: 'lib2', room: 'library', label: 'L-102', location: 'Wall Outlet 2' },
      { key: 'lab1', room: 'lab', label: 'B-201', location: 'Lab row A' },
      { key: 'lab2', room: 'lab', label: 'B-202', location: 'Lab row B' },
      { key: 'st1', room: 'staff', label: 'S-101', location: 'Wall Outlet 1' },
      { key: 'srv1', room: 'server', label: 'SRV-301', location: 'Rack outlet' },
    ],
    patchPanel: { name: 'Campus Patch Panel', location: 'Server Room Rack 1', ports: 48 },
    cables: [
      { id: 'L-101', outlet: 'lib1', port: '1', len: 30, type: 'Cat6', notes: 'Library outlet 1' },
      { id: 'L-102', outlet: 'lib2', port: '2', len: 30, type: 'Cat6', notes: 'Library outlet 2' },
      { id: 'B-201', outlet: 'lab1', port: '3', len: 25, type: 'Cat6', notes: 'ICT lab row A' },
      { id: 'B-202', outlet: 'lab2', port: '4', len: 25, type: 'Cat6', notes: 'ICT lab row B' },
      { id: 'S-101', outlet: 'st1', port: '5', len: 18, type: 'Cat6', notes: 'Staff office' },
      { id: 'SRV-301', outlet: 'srv1', port: '6', len: 2, type: 'Cat6', notes: 'Server uplink' },
    ],
    vlans: [
      { key: 'students', vlan_id: 10, name: 'Students', subnet: '10.10.10.0/24', gateway: '10.10.10.1', description: 'Student internet access (filtered)' },
      { key: 'staff', vlan_id: 20, name: 'Staff', subnet: '10.10.20.0/24', gateway: '10.10.20.1', description: 'Staff and administration network' },
      { key: 'wifi', vlan_id: 30, name: 'Campus_WiFi', subnet: '10.10.30.0/24', gateway: '10.10.30.1', description: 'Campus wireless network' },
      { key: 'servers', vlan_id: 99, name: 'Servers', subnet: '10.10.99.0/24', gateway: '10.10.99.1', description: 'Server and management network' },
    ],
    devices: [
      { name: 'CampusRouter', ip: '10.10.99.1', type: 'Router', vlan: 'servers', mac: '00:1A:2B:5C:4D:00', location: 'Server Room', monitored: 1 },
      { name: 'CoreSwitch', ip: '10.10.99.2', type: 'Switch', vlan: 'servers', mac: '00:1A:2B:5C:4D:01', location: 'Server Room', monitored: 1 },
      { name: 'LabSwitch', ip: '10.10.99.3', type: 'Switch', vlan: 'servers', mac: '00:1A:2B:5C:4D:02', location: 'ICT Lab', monitored: 1 },
      { name: 'LibraryAP', ip: '10.10.30.2', type: 'Access Point', vlan: 'wifi', mac: '00:1A:2B:5C:4D:03', location: 'Library', monitored: 1 },
      { name: 'SIS-Server', ip: '10.10.99.10', type: 'Server', vlan: 'servers', mac: '00:1A:2B:5C:4D:10', location: 'Server Room', monitored: 1 },
      { name: 'LabPC-01', ip: '10.10.10.20', type: 'Workstation', vlan: 'students', mac: '00:1A:2B:5C:4D:11', location: 'ICT Lab', monitored: 0 },
      { name: 'LabPC-02', ip: '10.10.10.21', type: 'Workstation', vlan: 'students', mac: '00:1A:2B:5C:4D:12', location: 'ICT Lab', monitored: 0 },
      { name: 'StaffPC-01', ip: '10.10.20.10', type: 'Workstation', vlan: 'staff', mac: '00:1A:2B:5C:4D:13', location: 'Staff Office', monitored: 0 },
      { name: 'LabPrinter', ip: '10.10.20.25', type: 'Printer', vlan: 'staff', mac: '00:1A:2B:5C:4D:14', location: 'Staff Office', monitored: 0 },
    ],
    issues: [
      { title: 'ICT lab Wi-Fi unstable', description: 'Students report frequent disconnects near the library. LibraryAP signal seems weak.', severity: 'Medium', status: 'In Progress', device: 'LibraryAP', outlet: 'lib1' },
      { title: 'SIS login slow', description: 'SIS-Server responds slowly during exam registration periods.', severity: 'High', status: 'Open', device: 'SIS-Server', outlet: null },
    ],
  },

  branch: {
    id: 'branch',
    name: 'Retail Branch / Store',
    tagline: 'POS, back-office, guest Wi-Fi, and IP cameras for a small store branch.',
    rooms: [
      { key: 'sales', name: 'Sales Floor', floor: '1', purpose: 'Customer area and registers' },
      { key: 'pos', name: 'POS Counter', floor: '1', purpose: 'Checkout terminals' },
      { key: 'back', name: 'Back Office', floor: '1', purpose: 'Manager and staff area' },
      { key: 'closet', name: 'Server Closet', floor: '1', purpose: 'Equipment' },
    ],
    outlets: [
      { key: 's1', room: 'sales', label: 'SL-101', location: 'Sales floor outlet' },
      { key: 'p1', room: 'pos', label: 'POS-201', location: 'Checkout 1' },
      { key: 'p2', room: 'pos', label: 'POS-202', location: 'Checkout 2' },
      { key: 'b1', room: 'back', label: 'BO-301', location: 'Back office outlet' },
      { key: 'c1', room: 'closet', label: 'SC-401', location: 'Closet rack' },
    ],
    patchPanel: { name: 'Branch Patch Panel', location: 'Server Closet Rack 1', ports: 24 },
    cables: [
      { id: 'SL-101', outlet: 's1', port: '1', len: 20, type: 'Cat6', notes: 'Sales floor' },
      { id: 'POS-201', outlet: 'p1', port: '2', len: 10, type: 'Cat6', notes: 'Checkout 1' },
      { id: 'POS-202', outlet: 'p2', port: '3', len: 10, type: 'Cat6', notes: 'Checkout 2' },
      { id: 'BO-301', outlet: 'b1', port: '4', len: 8, type: 'Cat6', notes: 'Back office' },
      { id: 'SC-401', outlet: 'c1', port: '5', len: 1, type: 'Cat6', notes: 'Rack uplink' },
    ],
    vlans: [
      { key: 'pos', vlan_id: 10, name: 'POS', subnet: '192.168.10.0/24', gateway: '192.168.10.1', description: 'Point-of-sale terminals' },
      { key: 'staff', vlan_id: 20, name: 'Staff', subnet: '192.168.20.0/24', gateway: '192.168.20.1', description: 'Staff and management' },
      { key: 'guest', vlan_id: 30, name: 'Guest_WiFi', subnet: '192.168.30.0/24', gateway: '192.168.30.1', description: 'Guest internet access' },
      { key: 'iot', vlan_id: 40, name: 'Cameras', subnet: '192.168.40.0/24', gateway: '192.168.40.1', description: 'IP cameras and IoT' },
    ],
    devices: [
      { name: 'BranchRouter', ip: '192.168.10.254', type: 'Router', vlan: 'staff', mac: '00:1B:2B:3C:4D:00', location: 'Server Closet', monitored: 1 },
      { name: 'POSSwitch', ip: '192.168.10.253', type: 'Switch', vlan: 'staff', mac: '00:1B:2B:3C:4D:01', location: 'Server Closet', monitored: 1 },
      { name: 'POS-01', ip: '192.168.10.10', type: 'Workstation', vlan: 'pos', mac: '00:1B:2B:3C:4D:10', location: 'POS Counter', monitored: 1 },
      { name: 'POS-02', ip: '192.168.10.11', type: 'Workstation', vlan: 'pos', mac: '00:1B:2B:3C:4D:11', location: 'POS Counter', monitored: 1 },
      { name: 'ManagerPC', ip: '192.168.20.10', type: 'Workstation', vlan: 'staff', mac: '00:1B:2B:3C:4D:12', location: 'Back Office', monitored: 0 },
      { name: 'GuestAP', ip: '192.168.30.2', type: 'Access Point', vlan: 'guest', mac: '00:1B:2B:3C:4D:13', location: 'Sales Floor', monitored: 1 },
      { name: 'NVR-Camera', ip: '192.168.40.10', type: 'Server', vlan: 'iot', mac: '00:1B:2B:3C:4D:14', location: 'Server Closet', monitored: 1 },
      { name: 'ReceiptPrinter', ip: '192.168.20.25', type: 'Printer', vlan: 'staff', mac: '00:1B:2B:3C:4D:15', location: 'Back Office', monitored: 0 },
    ],
    issues: [
      { title: 'Checkout 2 terminal slow', description: 'POS-02 frequently times out during card payments.', severity: 'High', status: 'Open', device: 'POS-02', outlet: 'p2' },
      { title: 'Camera 3 offline at night', description: 'NVR-Video feed drops between 8pm and 6am.', severity: 'Medium', status: 'In Progress', device: 'NVR-Camera', outlet: null },
    ],
  },

  homelab: {
    id: 'homelab',
    name: 'Home Lab / Small Office',
    tagline: 'Router, switch, NAS, and a few devices — a compact learning or home setup.',
    rooms: [
      { key: 'living', name: 'Living Room', floor: '1', purpose: 'Wi-Fi coverage' },
      { key: 'office', name: 'Home Office', floor: '1', purpose: 'Work-from-home desk' },
      { key: 'server', name: 'Server Corner', floor: '1', purpose: 'Lab equipment' },
    ],
    outlets: [
      { key: 'lv1', room: 'living', label: 'LR-101', location: 'TV corner' },
      { key: 'of1', room: 'office', label: 'HO-201', location: 'Desk outlet' },
      { key: 'sv1', room: 'server', label: 'SC-301', location: 'Lab rack' },
    ],
    patchPanel: { name: 'Lab Patch Panel', location: 'Server Corner', ports: 12 },
    cables: [
      { id: 'LR-101', outlet: 'lv1', port: '1', len: 10, type: 'Cat6', notes: 'Living room' },
      { id: 'HO-201', outlet: 'of1', port: '2', len: 15, type: 'Cat6', notes: 'Home office' },
      { id: 'SC-301', outlet: 'sv1', port: '3', len: 1, type: 'Cat6', notes: 'Lab uplink' },
    ],
    vlans: [
      { key: 'home', vlan_id: 10, name: 'Home', subnet: '192.168.1.0/24', gateway: '192.168.1.1', description: 'Primary home network' },
      { key: 'work', vlan_id: 20, name: 'Work', subnet: '192.168.20.0/24', gateway: '192.168.20.1', description: 'Work devices' },
      { key: 'guest', vlan_id: 30, name: 'Guest', subnet: '192.168.30.0/24', gateway: '192.168.30.1', description: 'Guest Wi-Fi' },
      { key: 'lab', vlan_id: 99, name: 'Lab', subnet: '192.168.99.0/24', gateway: '192.168.99.1', description: 'Homelab servers' },
    ],
    devices: [
      { name: 'HomeRouter', ip: '192.168.1.1', type: 'Router', vlan: 'home', mac: '00:1C:2B:3C:4D:00', location: 'Server Corner', monitored: 1 },
      { name: 'LabSwitch', ip: '192.168.1.2', type: 'Switch', vlan: 'home', mac: '00:1C:2B:3C:4D:01', location: 'Server Corner', monitored: 1 },
      { name: 'NAS', ip: '192.168.1.10', type: 'Server', vlan: 'lab', mac: '00:1C:2B:3C:4D:10', location: 'Server Corner', monitored: 1 },
      { name: 'WorkPC', ip: '192.168.20.10', type: 'Workstation', vlan: 'work', mac: '00:1C:2B:3C:4D:11', location: 'Home Office', monitored: 1 },
      { name: 'DesktopPC', ip: '192.168.1.20', type: 'Workstation', vlan: 'home', mac: '00:1C:2B:3C:4D:12', location: 'Living Room', monitored: 0 },
      { name: 'RaspberryPi', ip: '192.168.1.30', type: 'Server', vlan: 'lab', mac: '00:1C:2B:3C:4D:13', location: 'Server Corner', monitored: 0 },
      { name: 'HomePrinter', ip: '192.168.1.25', type: 'Printer', vlan: 'home', mac: '00:1C:2B:3C:4D:14', location: 'Home Office', monitored: 0 },
    ],
    issues: [
      { title: 'NAS backup slow', description: 'NAS transfer speeds drop below 20 MB/s during offsite sync.', severity: 'Low', status: 'In Progress', device: 'NAS', outlet: null },
    ],
  },
};

function buildDiagram(devices, rooms, vlanName) {
  let nodeSeq = 0;
  const nodeId = (name) => 'n-' + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + (++nodeSeq);
  const routers = devices.filter((d) => d.type === 'Router');
  const switches = devices.filter((d) => d.type === 'Switch');
  const aps = devices.filter((d) => DEVICE_NODE_TYPE[d.type] === 'wireless');
  const ends = devices.filter((d) => d.type !== 'Router' && d.type !== 'Switch' && DEVICE_NODE_TYPE[d.type] !== 'wireless');

  const nodes = [];
  const links = [];
  const add = (d, zoneId) => {
    const n = {
      id: nodeId(d.name),
      type: DEVICE_NODE_TYPE[d.type] || 'pc',
      label: d.name,
      x: 120 + nodes.length * 90,
      y: 110 + nodes.length * 34,
      device_id: d.id,
      status: 'unknown',
      ip: d.ip,
    };
    if (zoneId) n.zone = zoneId;
    nodes.push(n);
    return n;
  };

  const zones = (rooms.length ? rooms : []).map((r, i) => ({
    id: 'z-' + r.key,
    label: r.name,
    x: 40 + i * 360,
    y: 30,
    w: 340,
    h: 430,
    room_id: null,
  }));
  if (!zones.length) zones.push({ id: 'z-map', label: vlanName || 'Network', x: 40, y: 30, w: 700, h: 430, room_id: null });

  const coreZone = zones.length ? zones[0].id : null;
  const endZone = zones[1] ? zones[1].id : coreZone;
  const coreDevices = [...routers, ...switches, ...aps];
  coreDevices.forEach((d) => add(d, coreZone));
  ends.forEach((d) => add(d, endZone));

  for (let i = 1; i < nodes.length; i++) {
    links.push({ from: nodes[0].id, to: nodes[i].id, type: 'copper' });
  }
  return { nodes, links, zones };
}

async function loadTemplate(db, templateKey) {
  const tpl = TEMPLATES[templateKey] || TEMPLATES.office;

  for (const t of DELETE_ORDER) {
    await db.query(`DELETE FROM ${t}`);
  }

  const runInsert = async (sql, params) => {
    const { rows } = await db.query(sql, params);
    return rows[0].id;
  };

  const roomId = {};
  for (const r of tpl.rooms) {
    roomId[r.key] = await runInsert('INSERT INTO rooms (name, floor, purpose, org_id) VALUES ($1,$2,$3,$4) RETURNING id', [r.name, r.floor, r.purpose, ORG_ID]);
  }

  const outletId = {};
  for (const o of tpl.outlets) {
    outletId[o.key] = await runInsert('INSERT INTO outlets (room_id, label, location, org_id) VALUES ($1,$2,$3,$4) RETURNING id', [roomId[o.room], o.label, o.location, ORG_ID]);
  }

  const ppId = await runInsert('INSERT INTO patch_panels (name, location, ports, org_id) VALUES ($1,$2,$3,$4) RETURNING id', [tpl.patchPanel.name, tpl.patchPanel.location, tpl.patchPanel.ports, ORG_ID]);

  const cableInsert = 'INSERT INTO cables (cable_id, outlet_id, patch_panel_id, patch_port, length_m, cable_type, test_result, status, notes, org_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id';
  for (const c of tpl.cables) {
    await runInsert(cableInsert, [c.id, outletId[c.outlet], ppId, c.port, c.len, c.type || 'Cat6', 'Pass', 'Active', c.notes, ORG_ID]);
  }

  const vlanId = {};
  const vlanInsert = 'INSERT INTO vlans (vlan_id, name, subnet, gateway, description, org_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id';
  for (const v of tpl.vlans) {
    vlanId[v.key] = await runInsert(vlanInsert, [v.vlan_id, v.name, v.subnet, v.gateway, v.description, ORG_ID]);
  }

  const devInsert = 'INSERT INTO devices (name, ip, device_type, vlan_id, mac, location, monitored, org_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id';
  const devices = [];
  for (const d of tpl.devices) {
    const deviceId = await runInsert(devInsert, [d.name, d.ip, d.type, vlanId[d.vlan], d.mac, d.location, d.monitored, ORG_ID]);
    devices.push({ id: deviceId, name: d.name, ip: d.ip, type: d.type });
  }

  const issueInsert = 'INSERT INTO issues (title, description, severity, status, device_id, outlet_id, reporter, org_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id';
  for (const i of tpl.issues) {
    const device = devices.find((d) => d.name === i.device);
    await runInsert(issueInsert, [i.title, i.description, i.severity, i.status, device ? device.id : null, i.outlet ? outletId[i.outlet] : null, 'Template setup', ORG_ID]);
  }

  const diagram = buildDiagram(devices, tpl.rooms, tpl.vlans[0] && tpl.vlans[0].name);
  await db.query('INSERT INTO diagram (id, org_id, data, updated_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) ON CONFLICT (org_id, id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at', [1, ORG_ID, JSON.stringify(diagram)]);
}

// Backwards-compatible shortcut: the original "demo" loader = office template.
async function loadDemo(db) {
  return loadTemplate(db, 'office');
}

module.exports = { loadDemo, loadTemplate, TEMPLATES };