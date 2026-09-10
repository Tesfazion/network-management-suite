async function loadDemo(db) {
  for (const t of ['diagram', 'monitor_history', 'issues', 'cables', 'devices', 'outlets', 'patch_panels', 'vlans', 'rooms']) {
    await db.query(`DELETE FROM ${t}`);
  }

  const runInsert = async (sql, params) => {
    const { rows } = await db.query(sql, params);
    return rows[0].id;
  };

  const rAdmin = await runInsert('INSERT INTO rooms (name, floor, purpose) VALUES ($1,$2,$3) RETURNING id', ['Admin Office', '1', 'Administration']);
  const rICT = await runInsert('INSERT INTO rooms (name, floor, purpose) VALUES ($1,$2,$3) RETURNING id', ['ICT/Networking Office', '1', 'Networking & Software Development']);
  const rServer = await runInsert('INSERT INTO rooms (name, floor, purpose) VALUES ($1,$2,$3) RETURNING id', ['Server Room', '1', 'Core infrastructure']);

  const oA1 = await runInsert('INSERT INTO outlets (room_id, label, location) VALUES ($1,$2,$3) RETURNING id', [rAdmin, 'A-101', 'Wall Outlet 1']);
  const oA2 = await runInsert('INSERT INTO outlets (room_id, label, location) VALUES ($1,$2,$3) RETURNING id', [rAdmin, 'A-102', 'Wall Outlet 2']);
  const oB1 = await runInsert('INSERT INTO outlets (room_id, label, location) VALUES ($1,$2,$3) RETURNING id', [rICT, 'B-201', 'Wall Outlet 1']);
  const oB2 = await runInsert('INSERT INTO outlets (room_id, label, location) VALUES ($1,$2,$3) RETURNING id', [rICT, 'B-202', 'Wall Outlet 2']);
  const oS1 = await runInsert('INSERT INTO outlets (room_id, label, location) VALUES ($1,$2,$3) RETURNING id', [rServer, 'S-301', 'Server Rack Outlet']);

  const ppId = await runInsert('INSERT INTO patch_panels (name, location, ports) VALUES ($1,$2,$3) RETURNING id', ['Core Patch Panel', 'Server Room Rack 1', 24]);

  const cableInsert = 'INSERT INTO cables (cable_id, outlet_id, patch_panel_id, patch_port, length_m, cable_type, test_result, status, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id';
  await runInsert(cableInsert, ['A-101', oA1, ppId, '1', 15, 'Cat6', 'Pass', 'Active', 'Admin office outlet 1']);
  await runInsert(cableInsert, ['A-102', oA2, ppId, '2', 15, 'Cat6', 'Pass', 'Active', 'Admin office outlet 2']);
  await runInsert(cableInsert, ['B-201', oB1, ppId, '3', 12, 'Cat6', 'Pass', 'Active', 'ICT office outlet 1']);
  await runInsert(cableInsert, ['B-202', oB2, ppId, '4', 12, 'Cat6', 'Pass', 'Active', 'Retested after re-crimp']);
  await runInsert(cableInsert, ['S-301', oS1, ppId, '5', 3, 'Cat6', 'Pass', 'Active', 'Server rack uplink']);

  const vAdmin = await runInsert('INSERT INTO vlans (vlan_id, name, subnet, gateway, description) VALUES ($1,$2,$3,$4,$5) RETURNING id', [10, 'Admin', '192.168.10.0/24', '192.168.10.1', 'Administrative staff network']);
  const vIct = await runInsert('INSERT INTO vlans (vlan_id, name, subnet, gateway, description) VALUES ($1,$2,$3,$4,$5) RETURNING id', [20, 'ICT_Networking', '192.168.20.0/24', '192.168.20.1', 'Networking and software development unit']);
  const vInfra = await runInsert('INSERT INTO vlans (vlan_id, name, subnet, gateway, description) VALUES ($1,$2,$3,$4,$5) RETURNING id', [99, 'Infrastructure', '192.168.99.0/24', '192.168.99.1', 'Network device management']);

  const devInsert = 'INSERT INTO devices (name, ip, device_type, vlan_id, mac, location, monitored) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id';
  const dCoreSwitch = await runInsert(devInsert, ['CoreSwitch', '192.168.99.2', 'Switch', vInfra, '00:1A:2B:3C:4D:01', 'Server Room', 1]);
  const dRouter = await runInsert(devInsert, ['Router', '192.168.99.1', 'Router', vInfra, '00:1A:2B:3C:4D:00', 'Server Room', 1]);
  const dAccess = await runInsert(devInsert, ['AccessSwitchA', '192.168.99.3', 'Switch', vInfra, '00:1A:2B:3C:4D:02', 'Server Room', 1]);
  const dAdminPc = await runInsert(devInsert, ['AdminPC-01', '192.168.10.10', 'Workstation', vAdmin, '00:1A:2B:3C:4D:11', 'Admin Office', 1]);
  const dIctPc = await runInsert(devInsert, ['ICT-PC-01', '192.168.20.10', 'Workstation', vIct, '00:1A:2B:3C:4D:21', 'ICT Office', 1]);
  const dFile = await runInsert(devInsert, ['FileServer', '192.168.10.50', 'Server', vAdmin, '00:1A:2B:3C:4D:30', 'Server Room', 1]);
  const dWeb = await runInsert(devInsert, ['WEB-SRV-01', '192.168.10.60', 'Server', vAdmin, '00:1A:2B:3C:4D:31', 'Server Room', 1]);
  const dPrinter1 = await runInsert(devInsert, ['Printer-01', '192.168.20.25', 'Workstation', vIct, '00:1A:2B:3C:4D:40', 'ICT Office', 0]);
  const dPrinter2 = await runInsert(devInsert, ['Printer-02', '192.168.20.25', 'Workstation', vIct, '00:1A:2B:3C:4D:41', 'ICT Office', 0]);
  const dHrPc = await runInsert(devInsert, ['HR-PC-01', '192.168.30.10', 'Workstation', vAdmin, '00:1A:2B:3C:4D:50', 'Admin Office', 0]);

  const issueInsert = 'INSERT INTO issues (title, description, severity, status, device_id, outlet_id, reporter) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id';
  await runInsert(issueInsert, [
    'File server unreachable from Admin Office',
    'Users report they cannot open shared folders. FileServer does not respond to ping from VLAN 10.',
    'High', 'Open', dFile, oA2, 'Zewudu (Networking Head)',
  ]);
  await runInsert(issueInsert, [
    'Slow internet on ICT office',
    'Connectivity is slow and intermittent on outlet B-201. Suspected faulty cable or wall outlet.',
    'Medium', 'In Progress', dIctPc, oB1, 'ICT staff',
  ]);
  await runInsert(issueInsert, [
    'Printer offline',
    'Printer-01 not detected on the network. Possibly related to power cycling during maintenance.',
    'Low', 'Resolved', dPrinter1, null, 'Helpdesk',
  ]);

  const zones = [
    { id: 'z-server', label: 'Server Room', x: 50, y: 40, w: 280, h: 300, room_id: rServer },
    { id: 'z-admin', label: 'Admin Office', x: 380, y: 40, w: 360, h: 300, room_id: rAdmin },
    { id: 'z-ict', label: 'ICT Office', x: 790, y: 40, w: 360, h: 300, room_id: rICT },
  ];
  const nodes = [];
  const links = [];
  const node = (id, type, label, x, y, device_id, zone) => ({ id, type, label, x, y, device_id, zone: zone || null });
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

  links.push({ from: CORE, to: 'n-router' });
  links.push({ from: CORE, to: 'n-access' });
  links.push({ from: CORE, to: 'n-file' });
  links.push({ from: CORE, to: 'n-web' });
  links.push({ from: CORE, to: 'n-adminpc' });
  links.push({ from: CORE, to: 'n-hrpc' });
  links.push({ from: CORE, to: 'n-ictpc' });
  links.push({ from: CORE, to: 'n-printer1' });
  links.push({ from: CORE, to: 'n-printer2' });

  await db.query('INSERT INTO diagram (id, data, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at', [1, JSON.stringify({ zones, nodes, links })]);
}

module.exports = { loadDemo };
