const db = require('./db');

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
vlan.run(10, 'Admin', '192.168.10.0/24', '192.168.10.1', 'Administrative staff network');
vlan.run(20, 'ICT_Networking', '192.168.20.0/24', '192.168.20.1', 'Networking and software development unit');
vlan.run(99, 'Infrastructure', '192.168.99.0/24', '192.168.99.1', 'Network device management');

const dev = db.prepare('INSERT INTO devices (name, ip, device_type, vlan_id, mac, location, monitored) VALUES (?,?,?,?,?,?,?)');
dev.run('CoreSwitch', '192.168.99.2', 'Switch', 3, '00:1A:2B:3C:4D:01', 'Server Room', 1);
dev.run('Router', '192.168.99.1', 'Router', 3, '00:1A:2B:3C:4D:00', 'Server Room', 1);
dev.run('AccessSwitchA', '192.168.99.3', 'Switch', 3, '00:1A:2B:3C:4D:02', 'Server Room', 1);
dev.run('AdminPC-01', '192.168.10.10', 'Workstation', 1, '00:1A:2B:3C:4D:11', 'Admin Office', 1);
dev.run('ICT-PC-01', '192.168.20.10', 'Workstation', 2, '00:1A:2B:3C:4D:21', 'ICT Office', 1);
dev.run('FileServer', '192.168.10.50', 'Server', 1, '00:1A:2B:3C:4D:30', 'Server Room', 1);
dev.run('WEB-SRV-01', '192.168.10.60', 'Server', 1, '00:1A:2B:3C:4D:31', 'Server Room', 1);

try { db.prepare('COMMIT').run(); } catch (e) {}
console.log('Seeded sample data successfully.');
