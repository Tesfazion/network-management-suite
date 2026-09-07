# Network Management Suite

A complete web application for documenting, administering, and monitoring small-to-medium office network infrastructure — physical cabling, patch panels, wall outlets, IP/VLAN assignment, and live device availability.

Built as a real-world problem-solving project based on the network operations of a zonal government office (Wolayita Zone Innovation and Technology office), it replaces manual, spreadsheet-based record keeping with a single integrated dashboard.

![Stack](https://img.shields.io/badge/Node.js-Express%205-339933) ![DB](https://img.shields.io/badge/SQLite-better--sqlite3-blue) ![Frontend](https://img.shields.io/badge/Frontend-Vanilla%20JS-orange)

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the application](#running-the-application)
  - [Resetting the database](#resetting-the-database)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Monitoring](#monitoring)
- [Screenshots / Demo Data](#screenshots--demo-data)
- [Ideas for Extensions](#ideas-for-extensions)
- [License](#license)

---

## Features

### 1. Infrastructure Documentation
Records the physical network plant, mirroring the structured-cabling work performed on-site:

- **Rooms** — offices, server room, floors, and purpose.
- **Wall Outlets** — labeled outlets per room (e.g. `A-101`, `B-201`).
- **Patch Panels** — rack-located panels with port counts.
- **Cable Runs** — links between outlets and patch-panel ports, including cable type (Cat5e/Cat6/Cat6a), length, test result (Pass/Fail/Pending), and lifecycle status.

### 2. IP & VLAN Administration
Tracks the logical network design that separates departments:

- **VLANs** — VLAN ID, name, subnet, and gateway (e.g. VLAN 10 Admin `192.168.10.0/24`).
- **Devices / IP Inventory** — routers, switches, servers, workstations with IP, MAC, VLAN assignment, and location.

### 3. Live Monitoring
Pings monitored devices on demand or all at once:

- **Up/Down status** with round-trip time (RTT) in milliseconds.
- **Per-device monitoring history** (last 50 checks) for trend review.
- **Dashboard uptime snapshot** showing current availability across the fleet.

### 4. Dashboard
Aggregated operational overview: counts of rooms, outlets, active cables, failed cable tests, patch panels, VLANs, devices, and the live up/down summary.

---

## Architecture

```
┌─────────────────────────────┐
│  Web Browser (frontend)     │
│  Vanilla HTML/CSS/JS        │
└──────────────┬──────────────┘
               │  REST / JSON (fetch)
┌──────────────▼──────────────┐
│  Node.js + Express (API)     │
│  server/server.js            │
└──────┬───────────────┬───────┘
       │               │
┌──────▼──────┐   ┌────▼────────────────┐
│ SQLite DB   │   │ System ping         │
│ network.db  │   │ server/monitor.js   │
└─────────────┘   └─────────────────────┘
```

- The **Express server** exposes a JSON API and serves the static frontend.
- **better-sqlite3** provides synchronous, zero-configuration persistence in a single file (`network.db`).
- **Monitoring** shells out to the operating system's `ping` command — no native build toolchain or elevated privileges required.

---

## Tech Stack

| Layer       | Technology                                   |
|-------------|----------------------------------------------|
| Backend     | Node.js, Express 5                            |
| Database    | SQLite via `better-sqlite3`                   |
| Monitoring  | OS `ping` (ICMP) through `child_process`      |
| Frontend    | Vanilla HTML5, CSS3, JavaScript (no build step) |
| Runtime     | Node.js ≥ 18                                   |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) **≥ 18** (developed and tested on Node 24).
- `npm` (bundled with Node.js).
- A system `ping` command available on `PATH` (standard on Windows, macOS, and Linux).

### Installation

```bash
# 1. Clone or copy the project, then install dependencies
npm install

# 2. Optional — load demo data reflecting a typical office setup
npm run seed
```

> **Note:** `better-sqlite3` compiles a native binding during `npm install`. A prebuilt binary is downloaded automatically for most platforms. If compilation is required, make sure a compatible build toolchain is present (e.g. Visual Studio Build Tools / Python on Windows).

### Running the application

```bash
npm start
```

Open your browser and visit:

```
http://localhost:3000
```

The server prints the URL on startup. To run on a different port:

```bash
$env:PORT = 8080   # PowerShell
npm start
```

### Resetting the database

To start from a clean slate:

```bash
# Stop the server, then delete the database file(s)
Remove-Item network.db*   # Windows (PowerShell)
# or
rm network.db*            # Linux/macOS

npm run seed              # optional: reload demo data
npm start
```

---

## Project Structure

```
├── package.json            # Project metadata, scripts, dependencies
├── network.db              # SQLite database (created automatically)
├── server/
│   ├── db.js               # Schema definition + connection
│   ├── seed.js             # Demo data loader
│   ├── monitor.js          # ICMP ping wrapper
│   └── server.js           # Express app + REST API
└── public/
    ├── index.html          # Single-page dashboard
    ├── css/
    │   └── style.css       # Dark theme styling
    └── js/
        └── app.js          # Frontend logic (tabs, CRUD, monitoring)
```

---

## API Reference

All endpoints return JSON and live under `http://localhost:3000/api`.

### Rooms

| Method | Path            | Description             |
|--------|-----------------|-------------------------|
| GET    | `/api/rooms`    | List rooms              |
| POST   | `/api/rooms`    | Create room             |
| DELETE | `/api/rooms/:id`| Delete room (cascade)   |

### Outlets

| Method | Path              | Description             |
|--------|-------------------|-------------------------|
| GET    | `/api/outlets`    | List wall outlets       |
| POST   | `/api/outlets`    | Create outlet           |
| DELETE | `/api/outlets/:id`| Delete outlet           |

### Patch Panels

| Method | Path                   | Description           |
|--------|------------------------|-----------------------|
| GET    | `/api/patchpanels`     | List patch panels     |
| POST   | `/api/patchpanels`     | Create patch panel    |
| DELETE | `/api/patchpanels/:id` | Delete patch panel    |

### Cables

| Method | Path             | Description                                   |
|--------|------------------|-----------------------------------------------|
| GET    | `/api/cables`    | List cable runs (joined with outlet/room/panel)|
| POST   | `/api/cables`    | Create cable run                              |
| PATCH  | `/api/cables/:id`| Update test result / status                   |
| DELETE | `/api/cables/:id`| Delete cable run                              |

### VLANs

| Method | Path         | Description       |
|--------|--------------|-------------------|
| GET    | `/api/vlans` | List VLANs        |
| POST   | `/api/vlans` | Create VLAN       |

### Devices

| Method | Path              | Description        |
|--------|-------------------|--------------------|
| GET    | `/api/devices`    | List devices       |
| POST   | `/api/devices`    | Create device      |
| PATCH  | `/api/devices/:id`| Update device      |
| DELETE | `/api/devices/:id`| Delete device      |

### Monitoring

| Method | Path                       | Description                                   |
|--------|----------------------------|-----------------------------------------------|
| POST   | `/api/monitor/check/:id`   | Ping a single device and record the result     |
| POST   | `/api/monitor/check-all`   | Ping all monitored devices concurrently        |
| GET    | `/api/monitor/status`      | Latest status for every monitored device       |
| GET    | `/api/monitor/history/:id` | Last 50 checks for a device                    |

### Dashboard

| Method | Path            | Description                        |
|--------|-----------------|------------------------------------|
| GET    | `/api/dashboard`| Aggregate counts and uptime summary |

**Example — create a device:**

```bash
curl -X POST http://localhost:3000/api/devices \
  -H "Content-Type: application/json" \
  -d '{"name":"Printer-01","ip":"192.168.10.20","device_type":"Workstation","vlan_id":1,"monitored":true}'
```

**Example — ping a device:**

```bash
curl -X POST http://localhost:3000/api/monitor/check/4
```

---

## Monitoring

Monitoring uses the operating system's `ping` command, which makes it dependency-free and works without special privileges. Devices are monitored when:

- `monitored` is enabled on the device, **or**
- the device type is `Router` or `Switch` (infrastructure devices are always tracked).

Each check records **status** (`up`/`down`) and **round-trip time** into `monitor_history`, which powers both the status table and the per-device history panel.

> **Tip for demos:** devices on private networks (e.g. the seeded `192.168.x.x` devices) will typically report `down` on a machine not connected to that network, which neatly demonstrates the monitoring detecting failures. For a guaranteed `up` example, ping `127.0.0.1` (your own machine) from the Monitoring tab.

---

## Screenshots / Demo Data

Seed data (`npm run seed`) reflects a real office layout and connects every module:

| Entity        | Demo entries                                        |
|---------------|-----------------------------------------------------|
| Rooms         | Admin Office, ICT/Networking Office, Server Room     |
| Outlets       | A-101, A-102, B-201, B-202, S-301                    |
| Patch Panels  | Core Patch Panel (24 ports)                          |
| Cables        | A-101 … S-301, tested Pass, active                   |
| VLANs         | 10 Admin, 20 ICT_Networking, 99 Infrastructure       |
| Devices       | Router, CoreSwitch, AccessSwitchA, AdminPC-01, ICT-PC-01, FileServer, WEB-SRV-01 |

---

## Ideas for Extensions

- **Authentication & roles** — admin vs. view-only access.
- **Auto-refresh** — schedule monitoring checks with `setInterval` and push status via WebSockets/SSE.
- **Alerts** — email/Telegram notifications when a watched device goes down.
- **Rack diagram** — visual rack/patch-panel mapping (DP/port to outlet).
- **CSV/Excel export** — generate the cable log as a spreadsheet.
- **Network scanning** — integrate `arp`/`nmap` to auto-discover devices on the LAN.

---

## License

This project was created as part of a Computer Science internship report (Dilla University, 2026) and is shared for educational and demonstration purposes.