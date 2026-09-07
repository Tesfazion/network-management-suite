function loadDemo(db) {
  db.prepare('PRAGMA foreign_keys = ON').run();
  for (const t of ['diagram', 'monitor_history', 'issues', 'cables', 'devices', 'outlets', 'patch_panels', 'vlans', 'rooms']) {
    db.prepare(`DELETE FROM ${t}`).run();
  }

  try { db.prepare('BEGIN').run(); } catch (e) {}

  const run = db.prepare('INSERT INTO rooms (name, floor, purpose) VALUES (?,?,?)');
  const rAdmin = run.run('Admin Office', '1', 'Administration').lastInsertRowid;
  const rICT = run.run('ICT/Networking Office', '1', 'Networking & Software Development').lastInsertRowid;
  const rServer = run.run('Server Room', '1', 'Core infrastructure').lastInsertRowid;

  const out = db.prepare('INSERT INTO outlets (room_id, label, location) VALUES (?,?,?)');
  const oA1 = out.run(rAdmin, 'A-101', 'Wall Outlet 1').lastInsertRowid;
  const oA2 = out.run(rAdmin, 'A-102', 'Wall Outlet 2').lastInsertRowid;
  const oB1 = out.run(rICT, 'B-201', 'Wall Outlet 1').lastInsertRowid;
  const oB2 = out.run(rICT, 'B-202', 'Wall Outlet 2').lastInsertRowid;
  const oS1 = out.run(rServer, 'S-301', 'Server Rack Outlet').lastInsertRowid;

  const pp = db.prepare('INSERT INTO patch_panels (name, location, ports) VALUES (?,?,?)');
  const ppId = pp.run('Core Patch Panel', 'Server Room Rack 1', 24).lastInsertRowid;

  const cable = db.prepare(`INSERT INTO cables
    (cable_id, outlet_id, patch_panel_id, patch_port, length_m, cable_type, test_result, status, notes)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  cable.run('A-101', oA1, ppId, '1', 15, 'Cat6', 'Pass', 'Active', 'Admin office outlet 1');
  cable.run('A-102', oA2, ppId, '2', 15, 'Cat6', 'Pass', 'Active', 'Admin office outlet 2');
  cable.run('B-201', oB1, ppId, '3', 12, 'Cat6', 'Pass', 'Active', 'ICT office outlet 1');
  cable.run('B-202', oB2, ppId, '4', 12, 'Cat6', 'Pass', 'Active', 'Retested after re-crimp');
  cable.run('S-301', oS1, ppId, '5', 3, 'Cat6', 'Pass', 'Active', 'Server rack uplink');

  const vlan = db.prepare('INSERT INTO vlans (vlan_id, name, subnet, gateway, description) VALUES (?,?,?,?,?)');
  const vAdmin = vlan.run(10, 'Admin', '192.168.10.0/24', '192.168.10.1', 'Administrative staff network').lastInsertRowid;
  const vIct = vlan.run(20, 'ICT_Networking', '192.168.20.0/24', '192.168.20.1', 'Networking and software development unit').lastInsertRowid;
  const vInfra = vlan.run(99, 'Infrastructure', '192.168.99.0/24', '192.168.99.1', 'Network device management').lastInsertRowid;

  const dev = db.prepare('INSERT INTO devices (name, ip, device_type, vlan_id, mac, location, monitored) VALUES (?,?,?,?,?,?,?)');
  const dCoreSwitch = dev.run('CoreSwitch', '192.168.99.2', 'Switch', vInfra, '00:1A:2B:3C:4D:01', 'Server Room', 1).lastInsertRowid;
  const dRouter = dev.run('Router', '192.168.99.1', 'Router', vInfra, '00:1A:2B:3C:4D:00', 'Server Room', 1).lastInsertRowid;
  const dAccess = dev.run('AccessSwitchA', '192.168.99.3', 'Switch', vInfra, '00:1A:2B:3C:4D:02', 'Server Room', 1).lastInsertRowid;
  const dAdminPc = dev.run('AdminPC-01', '192.168.10.10', 'Workstation', vAdmin, '00:1A:2B:3C:4D:11', 'Admin Office', 1).lastInsertRowid;
  const dIctPc = dev.run('ICT-PC-01', '192.168.20.10', 'Workstation', vIct, '00:1A:2B:3C:4D:21', 'ICT Office', 1).lastInsertRowid;
  const dFile = dev.run('FileServer', '192.168.10.50', 'Server', vAdmin, '00:1A:2B:3C:4D:30', 'Server Room', 1).lastInsertRowid;
  const dWeb = dev.run('WEB-SRV-01', '192.168.10.60', 'Server', vAdmin, '00:1A:2B:3C:4D:31', 'Server Room', 1).lastInsertRowid;
  const dPrinter1 = dev.run('Printer-01', '192.168.20.25', 'Workstation', vIct, '00:1A:2B:3C:4D:40', 'ICT Office', 0).lastInsertRowid;
  const dPrinter2 = dev.run('Printer-02', '192.168.20.25', 'Workstation', vIct, '00:1A:2B:3C:4D:41', 'ICT Office', 0).lastInsertRowid;
  const dHrPc = dev.run('HR-PC-01', '192.168.30.10', 'Workstation', vAdmin, '00:1A:2B:3C:4D:50', 'Admin Office', 0).lastInsertRowid;

  const issue = db.prepare(`
    INSERT INTO issues (title, description, severity, status, device_id, outlet_id, reporter)
    VALUES (?,?,?,?,?,?,?)`);
  issue.run(
    'File server unreachable from Admin Office',
    'Users report they cannot open shared folders. FileServer does not respond to ping from VLAN 10.',
    'High', 'Open', dFile, oA2, 'Zewudu (Networking Head)');
  issue.run(
    'Slow internet on ICT office',
    'Connectivity is slow and intermittent on outlet B-201. Suspected faulty cable or wall outlet.',
    'Medium', 'In Progress', dIctPc, oB1, 'ICT staff');
  issue.run(
    'Printer offline',
    'Printer-01 not detected on the network. Possibly related to power cycling during maintenance.',
    'Low', 'Resolved', dPrinter1, null, 'Helpdesk');

  try { db.prepare('COMMIT').run(); } catch (e) {}

  const byLabel = {
    Router: dRouter, CoreSwitch: dCoreSwitch, AccessSwitchA: dAccess,
    'AdminPC-01': dAdminPc, 'ICT-PC-01': dIctPc, FileServer: dFile, 'WEB-SRV-01': dWeb,
    'Printer-01': dPrinter1, 'Printer-02': dPrinter2, 'HR-PC-01': dHrPc,
  };
  const node = (id, type, label, x, y, device_id, zone) => ({ id, type, label, x, y, device_id, zone: zone || null });
  const zones = [
    { id: 'z-server', label: 'Server Room', x: 50, y: 40, w: 280, h: 300, room_id: rServer },
    { id: 'z-admin', label: 'Admin Office', x: 380, y: 40, w: 360, h: 300, room_id: rAdmin },
    { id: 'z-ict', label: 'ICT Office', x: 790, y: 40, w: 360, h: 300, room_id: rICT },
  ];
  const nodes = [];
  const links = [];
  const addNode = (id, type, label, x, y, device_id, zone) => {
    nodes.push(node(id, type, label, x, y, device_id, zone));
    return id;
  };
  const CORE = 'n-core';
  addNode(CORE, 'switch', 'CoreSwitch', 95, 110, dCoreSwitch, 'z-server');
  addNode('n-router', 'router', 'Router', 175, 110, dRouter, 'z-server');
  addNode('n-access', 'switch', 'AccessSwitchA', 95, 230, dAccess, 'z-server');
  addNode('n-file', 'server', 'FileServer', 175, 230, dFile, 'z-server');
  addNode('n-web', 'server', 'WEB-SRV-01', 255, 110, dWeb, 'z-server');
  addNode('n-adminpc', 'pc', 'AdminPC-01', 430, 110, dAdminPc, 'z-admin');
  addNode('n-hrpc', 'pc', 'HR-PC-01', 600, 110, dHrPc, 'z-admin');
  addNode('n-ictpc', 'pc', 'ICT-PC-01', 850, 110, dIctPc, 'z-ict');
  addNode('n-printer1', 'printer', 'Printer-01', 1010, 110, dPrinter1, 'z-ict');
  addNode('n-printer2', 'printer', 'Printer-02', 1010, 230, dPrinter2, 'z-ict');

  // CoreSwitch (VLAN 99 infra) fans out to every office access device and server
  links.push({ from: CORE, to: 'n-router' });
  links.push({ from: CORE, to: 'n-access' });
  links.push({ from: CORE, to: 'n-file' });
  links.push({ from: CORE, to: 'n-web' });
  links.push({ from: CORE, to: 'n-adminpc' });
  links.push({ from: CORE, to: 'n-hrpc' });
  links.push({ from: CORE, to: 'n-ictpc' });
  links.push({ from: CORE, to: 'n-printer1' });
  links.push({ from: CORE, to: 'n-printer2' });

  db.prepare(`INSERT INTO diagram (id, data, updated_at) VALUES (1, ?, datetime('now'))`)
    .run(JSON.stringify({ zones, nodes, links }));
}

module.exports = { loadDemo };