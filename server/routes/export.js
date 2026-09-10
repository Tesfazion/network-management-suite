const express = require('express');
const db = require('../db').pool;

const router = express.Router();

function toCsv(rows, headers) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const headerLine = headers.map(([label]) => label).join(',');
  const body = rows.map((r) => headers.map(([, key]) => esc(r[key])).join(',')).join('\n');
  return headerLine + '\n' + body;
}

function sendCsv(res, name, rows, headers) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(toCsv(rows, headers));
}

router.get('/export/cables.csv', async (req, res) => {
  const { rows } = await db.query(`
    SELECT c.cable_id, r.name AS room, o.label AS outlet, o.location AS outlet_location,
           pp.name AS panel, c.patch_port, c.cable_type, c.length_m, c.test_result, c.status, c.notes
    FROM cables c
    LEFT JOIN outlets o ON o.id = c.outlet_id
    LEFT JOIN rooms r ON r.id = o.room_id
    LEFT JOIN patch_panels pp ON pp.id = c.patch_panel_id
    ORDER BY c.cable_id`);
  sendCsv(res, 'cable-log.csv', rows, [
    ['Cable ID', 'cable_id'], ['Room', 'room'], ['Outlet', 'outlet'], ['Outlet Location', 'outlet_location'],
    ['Patch Panel', 'panel'], ['Port', 'patch_port'], ['Type', 'cable_type'],
    ['Length (m)', 'length_m'], ['Test Result', 'test_result'], ['Status', 'status'], ['Notes', 'notes'],
  ]);
});

router.get('/export/devices.csv', async (req, res) => {
  const { rows } = await db.query(`
    SELECT d.name, d.ip, d.device_type, d.mac, d.location, v.vlan_id AS vlan, v.name AS vlan_name, d.monitored
    FROM devices d LEFT JOIN vlans v ON v.id = d.vlan_id
    ORDER BY d.name`);
  sendCsv(res, 'device-inventory.csv', rows, [
    ['Name', 'name'], ['IP', 'ip'], ['Type', 'device_type'], ['MAC', 'mac'], ['Location', 'location'],
    ['VLAN ID', 'vlan'], ['VLAN Name', 'vlan_name'], ['Monitored', 'monitored'],
  ]);
});

module.exports = router;
