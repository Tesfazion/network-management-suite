# Network Management Suite

**Document · Administer · Monitor** — a complete, self-hosted web platform that turns scattered, manual records of an office computer network into one live, searchable system.

> Built as a real-world problem-solving project from a 9-week networking internship at the **Wolayita Zone Innovation and Technology office** (South Ethiopia Region). It replaces spreadsheet-based cable logs, hand-written IP records, and "who plugged in what" guessing with a single integrated dashboard.

![Stack](https://img.shields.io/badge/Node.js-Express%205-339933) ![DB](https://img.shields.io/badge/SQLite-better--sqlite3-blue) ![Frontend](https://img.shields.io/badge/Frontend-Vanilla%20JS-orange) ![Status](https://img.shields.io/badge/status-stable-brightgreen)

---

## Table of Contents

1. [What this project is](#what-this-project-is)
2. [The problem it solves](#the-problem-it-solves)
3. [What the platform does](#what-the-platform-does)
4. [Who it is for](#who-it-is-for)
5. [Modules in depth](#modules-in-depth)
6. [A real-world walkthrough](#a-real-world-walkthrough)
7. [Features](#features)
8. [Architecture](#architecture)
9. [How data is modelled (database schema)](#how-data-is-modelled-database-schema)
10. [Tech Stack](#tech-stack)
11. [Getting Started](#getting-started)
    - [Prerequisites](#prerequisites)
    - [Installation](#installation)
    - [Running the application](#running-the-application)
    - [Resetting the database](#resetting-the-database)
    - [Testing](#testing)
12. [Project Structure](#project-structure)
13. [API Reference](#api-reference)
14. [Monitoring explained](#monitoring-explained)
15. [Demo data](#demo-data)
16. [Ideas for Extensions](#ideas-for-extensions)
17. [License](#license)

---

## What this project is

The **Network Management Suite** is a lightweight, self-hosted web application that keeps **three kinds of network knowledge in one place** — and can be installed and branded for **any organization** in about a minute:

| # | Knowledge | What it records |
|-----------|-----------|-----------------|
| 1 | **Physical** | The *cabling plant*: rooms, wall outlets, patch panels, and every cable run between an outlet and a patch-panel port. |
| 2 | **Logical** | The *design*: VLANs (which department lives on which segmented network), and every device with its IP address, VLAN, MAC, and location. |
| 3 | **Live** | The *health*: whether each device answers a ping right now, how fast it responds (RTT), and a history of its availability over time. |
| 4 | **Operational** | *Incidents*: a log of reported problems linked to the affected device or outlet, tracked Open → In Progress → Resolved. |

It is a full-stack application you run on a single machine:

- **Backend** — Node.js + Express exposing a JSON REST API, backed by a **SQLite** file database (zero external dependencies, one small file).
- **Frontend** — a responsive, dark-themed single-page dashboard (vanilla HTML/CSS/JS, no build step) with **six** views: **Dashboard**, **Infrastructure**, **IP & VLAN**, **Monitoring**, **Incidents**, and a visual **Network Diagram** editor.
- **First-run setup wizard** — on a fresh install, the app greets you by name, stores your **organization name** (shown in the sidebar footer and browser title), and can pre-load a demonstration office network so every feature is populated instantly.

---

## The problem it solves

During the internship, the everyday reality of managing a real office network became obvious — and it is rarely elegant:

### 1. Cable records lived in a spreadsheet (or nowhere)
Every wall outlet, patch-panel port, and cable run had to be documented by hand. The cable log was a mix of paper notes, Excel rows, and tribal knowledge ("the yellow cable in port 4 goes to… I think"). When a cable failed, re-tracing it meant crawling under desks.

### 2. Nobody could see the whole network at a glance
Rooms, switches, VLANs, and devices were documented in different files, in different formats, maintained by different people. Seeing "which VLAN does the ICT office live on?" or "what is that IP address used for?" required digging through multiple documents.

### 3. IP address management was guesswork
An IP address conflict is a classic office headache. Without a **device/IP inventory**, assigning an address is a gamble — and troubleshooting "two devices fighting over 192.168.10.50" is slow and frustrating. Mis-assigned devices (an IP outside its VLAN's subnet, or worse, a device squatting on the gateway address) compound the chaos.

### 4. There was no visibility into device health
When "the internet is down", the first question is *"is it the ISP, the router, the switch, or the PC?"*. Manually pinging every device, one by one, is tedious — and nobody keeps a record that could show *when* a device went down or how often.

### 5. Incidents were tracked in memory and email threads
Reported problems ("the file server is slow", "outlet B-201 is dead") were handled, forgotten, and re-reported — there was no record of *what* was wrong, *which device/outlet* it affected, or whether it was actually resolved.

### 6. Documentation was never finished
Documenting is a chore people postpone — so it falls out of date quickly, and old documents become actively misleading. The only cure is a tool whose documentation **is** the tool: if it's not in the system, it doesn't exist.

---

## What the platform does

The Suite turns each pain point above into a designed feature:

| Problem | Platform response |
|---------|-------------------|
| Spreadsheet cable logs | A **Cable Runs** table where every run is linked to its outlet, room, panel, and port — with test result (Pass/Fail/Pending) and status — plus **one-click CSV export** of the whole cable log. |
| Scattered documentation | A single **REST API + database** behind one dashboard. Rooms, outlets, panels, cables, VLANs, and devices all reference each other, and a **global search** finds anything in seconds. |
| IP guesswork | A **device/IP inventory** that records name, IP, MAC, VLAN, and location — the "source of truth" before you assign an address. |
| IP conflicts & mis-assignment | **Automatic detection** of duplicate IPs, devices outside their VLAN subnet, and devices squatting on a VLAN gateway — flagged on the dashboard and IP & VLAN views. |
| No health visibility | **Live monitoring** that pings every tracked device on demand or all at once (**with auto-refresh**), reports **UP/DOWN** with round-trip time, and keeps per-device history. |
| Incidents evaporating | An **Incidents log** with severity, status workflow (Open → In Progress → Resolved), and links to the affected device and outlet, with an open-issue counter on the dashboard. |
| Documentation never finished | Updating records is a first-class action (add/edit/delete from the UI), and seeded demo data shows exactly how a well-documented network looks. |

### The dashboard ties it all together

The landing tab aggregates the *state of the world*:

- Counts of rooms, outlets, active cables, **failed cable tests**, patch panels, VLANs, devices, and **open incidents**.
- **IP conflict alerts** at the top, so address problems are visible before they bite.
- A live **uptime snapshot**: how many monitored devices are up vs. down right now.
- A **recent incidents** panel, so active problems are never out of sight.

This answers, in one screen: *"roughly how healthy is this network, and how much of it have we actually documented?"*

---

## Who it is for

- **SMEs and government/zonal offices** running their own small–medium LANs (the exact environment this was born in).
- **Network technicians** who wire buildings and need to hand over clean, testable documentation.
- **Students/graduates** wanted a realistic, complete full-stack project to study or extend.
- Any organization still tracking infrastructure in spreadsheets that wants a zero-cost upgrade path.

---

## Modules in depth

### Module 1 — Infrastructure (the physical plant)

The physical layer is a chain: **Room → Outlet → Cable → Patch panel port → Switch**.

- **Rooms** — every office, lab, or server room, with floor and purpose (e.g. *Admin Office*, *floor 1*).
- **Wall Outlets** — the labeled keystone jacks people actually plug into (e.g. `A-101`, `B-201`), each belonging to a room.
- **Patch Panels** — rack-mounted panels in the server room (e.g. *Core Patch Panel, 24 ports*).
- **Cable Runs** — the crucial relational record: one cable binds an **outlet** to a **patch-panel port**, and stores:
  - Cable ID (wall label ↔ port label convention, e.g. `A-101`),
  - Length in metres, cable category (Cat5e/Cat6/Cat6a),
  - **Test result** — Pass / Fail / Pending (this mirrors the real cable-testing step in structured cabling),
  - Lifecycle **status** — Active / Inactive.

> When a wall outlet loses its link, the technician opens *Infrastructure*, searches the outlet label, and immediately sees exactly **which patch-panel port** the run terminates at — no crawling under desks.

### Module 2 — IP & VLAN administration (the logical design)

- **VLANs** — the segmentation scheme, exactly as configured on the switches: VLAN ID, name, subnet, and gateway (e.g. *VLAN 10 Admin → 192.168.10.0/24 → gateway 192.168.10.1*).
- **Devices** — routers, switches, servers, and workstations, each carrying: IP address, MAC address, assigned VLAN, device type, and physical location.

> Before assigning an IP, you look it up here. **No more conflicts.** And when a device is suspected of an issue, its *device type* (Router/Switch) automatically makes it monitored.

### Module 3 — Monitoring (live health)

- Ping a **single device** any time, or **all devices** with one click.
- Each check records **status** + **round-trip time** into a history table.
- The **Monitoring tab** shows the latest status per device; clicking *history* shows the last 50 checks — so you can see *when* a device started failing, not just that it is failing.
- Optional **auto-refresh** keeps the status table current every 15 seconds.

### Module 4 — Incidents (the operational log)

The human side of network health: every reported problem, tracked to closure.

- **Incidents** carry a title, details, **severity** (Low/Medium/High), and a status workflow (**Open → In Progress → Resolved**).
- Each incident can be linked to the **affected device** and/or **wall outlet**, so the operator sees immediately what infrastructure is implicated.
- The dashboard shows an **open-issue counter** and a recent-incidents panel; the Incidents tab sorts active problems first and records a resolution timestamp.

### Module 5 — Conflict & health alerts

The Suite actively audits its own data:

- **Duplicate IP detection** — two devices claiming the same address.
- **Out-of-subnet detection** — a device whose IP lies outside its VLAN's subnet (CIDR-aware).
- **Gateway squatting** — a non-router device using its VLAN's gateway address.
- These are surfaced as alert banners on the Dashboard and IP & VLAN views, and counted on the dashboard.

### Module 6 — Network Diagram editor (visual canvas)

A lightweight, Packet-Tracer-style drawing board that mirrors the documented network *visually*:

- **Sites / office zones** — draw shaded containers (e.g. **Admin Office**, **ICT Office**, **Server Room**) that group the devices inside them and display a live device-type count card ("2 PCs · 2 Switches · 1 Router"). Drag a site's corner to resize it; dragging a site moves everything inside it.
- **Palette** — place Router, Switch, Server, PC, Printer, and Internet/cloud icons directly on the canvas. (Inspired by Cisco Packet Tracer's drag-and-drop layout.)
- **Drag, select, delete** — move nodes around with the pointer, select to highlight, press Delete or the toolbar button to remove.
- **Links** — "Connect" mode draws lines between two icons, exactly like cabling between devices.
- **Live status coloring** — attach any node to a real device from the inventory; the node turns **green (UP)**, **red (DOWN)**, or **grey (not checked)** based on the latest monitoring ping.
- **Import inventory** — one click rebuilds the whole canvas from the device database; "Auto-layout" arranges everything in a ring around the core switch.
- **Auto-save** — every change (nodes, links, and zones) is saved to the database automatically (debounced), so the diagram survives refresh.

---

## A real-world walkthrough

**Scenario — a user reports "my internet is slow".**

1. Open the **Monitoring** tab → *Check All Now*.
2. `Router → UP (4 ms)`, `CoreSwitch → UP (9 ms)`, `FileServer → DOWN` … the network core is fine; the file server is the problem.
3. Open **IP & VLAN** → find `FileServer` → location *Server Room*, VLAN *Admin*.
4. Open the server's **history** → it started failing at 09:42 — matching the timeframe the issue was reported.
5. The technician knows exactly what to check first, instead of rebooting the router "just in case".

**Scenario — a new office is wired.**

1. Add the room, add its outlets.
2. Add the patch panel(s).
3. Add each cable run as it is crimped and tested → mark **Pass/Fail**.
4. Create the VLANs, then add every device with its IP.
5. Enable monitoring on the active switches.
6. Documentation is *finished the day the work is* — and the dashboard shows all cables Active, no failed tests.

**Scenario — an engineer arrives mid-crisis.**

1. A user says printing is broken. The support log isn't a box of notes — it's the **Incidents** tab.
2. *"Printer offline"* (High, Open, linked to Printer-01) is visible immediately, alongside the dashboard's **open-issue counter**.
3. The **IP & VLAN** view warns that `Printer-01` and `Printer-02` are assigned the *same IP* — the likely root cause. One PATCH fixes the address.
4. The incident is marked **Resolved**, a timestamp is recorded, and the printer issue stops being re-reported into the void.

---

## Features

### Infrastructure Documentation
- Rooms, wall outlets, patch panels, and cable runs in one relational model.
- Cable metadata: ID, length, category, **test result** (Pass/Fail/Pending), status.
- Full CRUD through the UI (add, delete, update) + **one-click CSV export** of the cable log.

### IP & VLAN Administration
- VLAN register: ID, name, subnet, gateway, description.
- Device/IP inventory with MAC, VLAN binding, type, and location — with a per-device **monitor toggle**.
- **Automatic audits**: duplicate IPs, out-of-subnet addresses, and gateway squatting.

### Live Monitoring
- One-click/on-demand ICMP ping (single device or entire fleet).
- **UP/DOWN** status + round-trip time (ms).
- Per-device history (last 50 checks).
- Routers and switches are always monitored; any device can be opted in.
- Optional **auto-refresh** (15 s).

### Incidents
- Severity (Low/Medium/High) and status workflow (Open → In Progress → Resolved).
- Links to the affected **device and/or outlet**, reporter attribution, resolution timestamps.
- Open-issue counter + recent-incidents panel on the dashboard.

### Visual Diagram Editor
- Packet-Tracer-style icon palette (Router / Switch / Server / PC / Printer / Cloud), drag to move, click to connect.
- **Site / office zones** — shaded containers with device-type count cards, drag-to-move with their devices, corner resize, and rename.
- **Live health coloring** — linked nodes turn green/red based on monitoring status.
- **Import from inventory** + auto-layout in a ring around the core switch; automatic debounced saving.

### First-run setup & organization branding
- **Setup wizard** on first launch — name your organization (shown across the UI) and optionally load the demo network.
- Organization name editable anytime from the sidebar footer; a `scripts/setup.js` CLI covers headless/remote installs.

### Search, Export & UX
- **Global search** across devices, cables, outlets, rooms, VLANs, and incidents.
- **CSV export** of the cable log and the device inventory — the spreadsheet replacement.
- Notification toasts, empty states, and confirmation feedback throughout.

---

## Architecture

```
┌─────────────────────────────┐
│  Web Browser (frontend)     │   Vanilla HTML/CSS/JS
└──────────────┬──────────────┘
               │  REST / JSON (fetch)
┌──────────────▼──────────────┐
│  Node.js + Express 5 (API)   │   server/server.js
└──────┬───────────────┬───────┘
       │               │
┌──────▼──────┐   ┌────▼─────────────────┐
│ SQLite DB   │   │ System ping          │
│ network.db  │   │ (ICMP via child_proc)│
└─────────────┘   └─────────────────────┘
```

- The **Express server** serves the static frontend *and* exposes a JSON API.
- **SQLite (better-sqlite3)** gives synchronous, transaction-safe persistence in a single portable file — ideal for an office tool with no database server.
- **Monitoring** shells out to the OS's `ping` — no privileged network libraries, no native toolchain.

---

## How data is modelled (database schema)

Relationships are the core of the Suite. Every table connects to the one before it:

```
rooms 1───n outlets 1───n cable_runs n───1 patch_panels
        └──────────────n──────────────┘   (via patch_port)

vlans 1───n devices
issues n───1 devices   (device_id, nullable)
issues n───1 outlets   (outlet_id, nullable)
monitor_history n───1 devices   (device_id, status, rtt_ms, checked_at)
```

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `rooms` | Office/server rooms | name, floor, purpose |
| `outlets` | Wall keystone jacks | label, location, **room_id** |
| `patch_panels` | Rack panels | name, location, ports |
| `cables` | The outlet↔port binding | **outlet_id**, **patch_panel_id**, patch_port, length_m, cable_type, test_result, status |
| `vlans` | Logical network segments | vlan_id, name, subnet, gateway |
| `devices` | Hardware + IP inventory | name, ip, device_type, **vlan_id**, mac, location, monitored |
| `issues` | Support incidents (workflow log) | title, severity, status, **device_id**, **outlet_id**, reporter, resolved_at |
| `monitor_history` | Ping results (append-only) | **device_id**, status, rtt_ms, checked_at |
| `diagram` | One-row persisted canvas | data (JSON: `{zones, nodes, links, device_id}`), updated_at |
| `settings` | Organization setup (single row) | **org_name**, installed_at |

Foreign-key behaviour is deliberate: deleting a room **cascades** to its outlets while cable runs **survive** with a nulled outlet reference (`ON DELETE SET NULL`), preserving the cabling record. Incidents keep their text if a linked device is removed. `monitor_history` is append-only — it never overwrites, so trends stay visible.

---

## Tech Stack

| Layer       | Technology                                   |
|-------------|----------------------------------------------|
| Backend     | Node.js, Express 5                            |
| Database    | SQLite via `better-sqlite3`                   |
| Monitoring  | OS `ping` (ICMP) via `child_process`          |
| Frontend    | Vanilla HTML5, CSS3, JavaScript (no build step) |
| Tests       | Node.js built-in test runner (`node --test`)  |
| Runtime     | Node.js ≥ 18                                   |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) **≥ 18** (developed and tested on Node 24).
- `npm` (bundled with Node.js).
- A system `ping` command on `PATH` (standard on Windows, macOS, and Linux).

### Installation

> **For any organization** — there is a one-click installer and a first-run setup wizard. The Suite binds `0.0.0.0` by default, so once it runs on one office machine, anyone on the LAN can reach it at `http://<server-ip>:8080`.

**Windows:**
```bash
install.bat      # installs dependencies and fetches optional demo data
npm start        # run it
```

**Linux / macOS:**
```bash
bash install.sh  # installs dependencies and fetches optional demo data
npm start
```

**Manual:**
```bash
# 1. Clone or copy the project, then install dependencies
npm install

# 2. Optional — load the demo data (a realistic office network)
npm run seed

# 3. Configure your organization without the browser (optional, headless installs)
npm run setup -- --org="Acme Office Network" --demo
```

> On first launch in a browser you'll be greeted by a **setup wizard**: type your organization name (it becomes the name shown in the sidebar footer and browser title) and choose whether to load the demonstration network.

> **Note:** `better-sqlite3` compiles a native binding during `npm install`. A prebuilt binary is downloaded automatically for most platforms; otherwise a compatible build toolchain is required (e.g. Visual Studio Build Tools on Windows).

### Running the application

```bash
npm start
```

Open your browser at **http://localhost:8080** (the server prints its URL on startup).

To run on another port:

```bash
$env:PORT = 9090   # PowerShell
# or
export PORT=9090   # Linux/macOS
npm start
```

**Linux service (systemd)** — for permanent installs, copy `deploy/nms.service` into `/etc/systemd/system/`, create a service user, adjust the paths, then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nms
```

The server binds `0.0.0.0` by default so other machines on the network can open `http://<server-ip>:8080`.

### Resetting the database

```bash
# Stop the server, then delete the database file(s)
Remove-Item network.db*   # Windows (PowerShell)
# or
rm network.db*            # Linux/macOS

npm run seed   # optional: reload demo data
npm start
```

### Testing

The project ships with an automated API test suite built on Node's built-in test runner (no extra dependencies):

```bash
npm test
```

Tests run against an isolated temporary database (so your `network.db` is never touched) and cover:

- Room CRUD and **cascade deletes** (room → outlets),
- **FK integrity** — cables survive a room deletion and their outlet reference is nulled (`ON DELETE SET NULL`),
- **`monitored` normalization** — the string `"0"` must not enable monitoring,
- **PATCH semantics** — updating only the fields provided,
- **Live monitoring** — a real ping to `127.0.0.1` returning `up` with an RTT value,
- **Dashboard** aggregates and uptime summary,
- **Incident lifecycle** — Create → In Progress → Resolved (with `resolved_at` stamped) → delete,
- **Conflict detection** — a duplicate IP pair and an out-of-subnet device are both flagged,
- **Global search** — finds incidents as well as devices/cables,
- **CSV export** — headers of the cable log and device inventory,
- **Diagram** — empty by default, persists nodes, links **and zones**,
- **Setup** — fresh install reports unconfigured; `POST /api/setup` stores the org name and demo-seeds the full dataset.

---

## Project Structure

```
├── package.json            # Project metadata, scripts, dependencies
├── install.bat             # Windows one-click installer
├── install.sh              # Linux/macOS one-click installer
├── network.db              # SQLite database (created automatically at first run)
├── deploy/
│   └── nms.service         # systemd unit for permanent Linux installs
├── scripts/
│   └── setup.js            # Headless org setup CLI (--org / --demo)
├── server/
│   ├── db.js               # Schema definition + connection factory
│   ├── seed.js             # Demo-data loader CLI
│   ├── seed-data.js        # Shared loadDemo(db) used by seed.js and /api/setup
│   ├── monitor.js          # ICMP ping wrapper
│   ├── iputil.js           # IP/CIDR helpers + conflict detection
│   ├── server.js           # Express app + REST API + static hosting
│   └── test/
│       └── api.test.js     # Automated API test suite (node:test)
└── public/
    ├── index.html          # Single-page dashboard
    ├── css/
    │   └── style.css       # Professional dark theme
    └── js/
        └── app.js          # Frontend logic (views, CRUD, monitoring, diagram, setup)
```

---

## API Reference

All endpoints return JSON and live under `http://localhost:8080/api`.

### Rooms
| Method | Path               | Description           |
|--------|--------------------|-----------------------|
| GET    | `/api/rooms`       | List rooms            |
| POST   | `/api/rooms`       | Create room           |
| DELETE | `/api/rooms/:id`   | Delete room (cascade) |

### Outlets
| Method | Path               | Description           |
|--------|--------------------|-----------------------|
| GET    | `/api/outlets`     | List wall outlets     |
| POST   | `/api/outlets`     | Create outlet         |
| DELETE | `/api/outlets/:id` | Delete outlet         |

### Patch Panels
| Method | Path                     | Description          |
|--------|--------------------------|----------------------|
| GET    | `/api/patchpanels`       | List patch panels    |
| POST   | `/api/patchpanels`       | Create patch panel   |
| DELETE | `/api/patchpanels/:id`   | Delete patch panel   |

### Cables
| Method | Path              | Description                                        |
|--------|-------------------|----------------------------------------------------|
| GET    | `/api/cables`     | List cable runs (joined with outlet/room/panel)    |
| POST   | `/api/cables`     | Create cable run                                   |
| PATCH  | `/api/cables/:id` | Update test result / status                        |
| DELETE | `/api/cables/:id` | Delete cable run                                   |

### VLANs
| Method | Path         | Description   |
|--------|--------------|---------------|
| GET    | `/api/vlans` | List VLANs    |
| POST   | `/api/vlans` | Create VLAN   |

### Devices
| Method | Path               | Description   |
|--------|--------------------|---------------|
| GET    | `/api/devices`     | List devices  |
| POST   | `/api/devices`     | Create device |
| PATCH  | `/api/devices/:id` | Update device |
| DELETE | `/api/devices/:id` | Delete device |

### Monitoring
| Method | Path                        | Description                            |
|--------|-----------------------------|----------------------------------------|
| POST   | `/api/monitor/check/:id`    | Ping one device, record the result     |
| POST   | `/api/monitor/check-all`    | Ping all monitored devices concurrently|
| GET    | `/api/monitor/status`       | Latest status for every device         |
| GET    | `/api/monitor/history/:id`  | Last 50 checks for a device            |

### Incidents
| Method | Path              | Description                                      |
|--------|-------------------|--------------------------------------------------|
| GET    | `/api/issues`     | List incidents (active first)                    |
| POST   | `/api/issues`     | Create incident                                  |
| PATCH  | `/api/issues/:id` | Update status/severity/detail (`resolved_at` set on Resolved/Closed) |
| DELETE | `/api/issues/:id` | Delete incident                                  |

### Audits & Search
| Method | Path             | Description                                             |
|--------|------------------|---------------------------------------------------------|
| GET    | `/api/conflicts` | Duplicate IPs, out-of-subnet devices, gateway squatting |
| GET    | `/api/search?q=` | Global search across all entities                       |

### Diagram
| Method | Path            | Description                                             |
|--------|-----------------|---------------------------------------------------------|
| GET    | `/api/diagram`  | Load the saved canvas state `{ zones, nodes, links }`   |
| PUT    | `/api/diagram`  | Persist the canvas (zones + nodes: id/type/label/x/y/device_id/zone + links) |

### Setup & organization
| Method | Path            | Description                                             |
|--------|-----------------|---------------------------------------------------------|
| GET    | `/api/setup`    | Returns `{ configured, org_name, demo }` — tells the UI whether to show the setup wizard |
| POST   | `/api/setup`    | Store the organization name; with `{ demo: true }` also loads the demo dataset |
| GET    | `/api/settings` | Current `{ org_name, installed_at }`                    |

### Exports
| Method | Path                        | Description                       |
|--------|-----------------------------|-----------------------------------|
| GET    | `/api/export/cables.csv`    | Cable log as a CSV spreadsheet    |
| GET    | `/api/export/devices.csv`   | Device/IP inventory as CSV        |

### Dashboard
| Method | Path            | Description                         |
|--------|-----------------|-------------------------------------|
| GET    | `/api/dashboard`| Aggregate counts + uptime + open issues |

**Example — create a device:**
```bash
curl -X POST http://localhost:8080/api/devices \
  -H "Content-Type: application/json" \
  -d '{"name":"Printer-01","ip":"192.168.10.20","device_type":"Workstation","vlan_id":1,"monitored":true}'
```

**Example — ping a device:**
```bash
curl -X POST http://localhost:8080/api/monitor/check/4
```

---

## Monitoring explained

Monitoring uses the operating system's `ping` command — the same tool a technician would type by hand, automated by the platform:

- A device is monitored when **`monitored` is enabled**, **or** its type is **Router/Switch** (core infrastructure is always tracked).
- A check records **status** (`up`/`down`) and **round-trip time** into `monitor_history`.
- The status table shows the *latest* result; the history panel shows the *last 50* — revealing patterns, not just snapshots.

> **Demo tip:** devices on private networks (the seeded `192.168.x.x` set) will report `down` on a machine not connected to that network — which neatly demonstrates failure detection. For a guaranteed `up` example, add a device pointing at `127.0.0.1` (your own machine).

---

## Demo data

`npm run seed` loads a realistic office network that exercises every module and references every one of your internship's themes — cabling (T568 crimping, labeling, testing), VLANs (departmental segmentation), routing/switching, AND real troubleshooting:

| Entity        | Demo entries                                                      |
|---------------|-------------------------------------------------------------------|
| Rooms         | Admin Office, ICT/Networking Office, Server Room                   |
| Outlets       | A-101, A-102, B-201, B-202, S-301                                  |
| Patch Panels  | Core Patch Panel (24 ports)                                        |
| Cables        | A-101 … S-301 — all tested **Pass**, status Active                 |
| VLANs         | 10 Admin (192.168.10.0/24), 20 ICT_Networking (192.168.20.0/24), 99 Infrastructure (192.168.99.0/24) |
| Devices       | Router, CoreSwitch, AccessSwitchA, AdminPC-01, ICT-PC-01, **WEB-SRV-01**, FileServer, Printer-01, **Printer-02**, HR-PC-01 |
| Issues        | High-file-server-down (Open), Medium-slow-internet (In Progress), Low-printer-paper (Resolved) |
| Diagram       | 3 site zones (Server Room, Admin Office, ICT Office) each with a shaded group of 10 linked, real-device icons — CoreSwitch in the middle |

The seed *deliberately* includes two live problems so the audit feature is immediately demonstrable:

- **Duplicate IP** — `Printer-01` and `Printer-02` share `192.168.20.25`.
- **Out-of-subnet** — `HR-PC-01` (192.168.30.10) sits outside the VLAN 10 subnet (192.168.10.0/24).

---

## Ideas for Extensions

- **Authentication & roles** — admin vs. view-only access.
- **Alerts** — email/Telegram notifications when a watched device goes down or a new incident is opened.
- **Rack diagram** — visual rack/patch-panel mapping (panel port → outlet).
- **Network discovery** — integrate `arp`/`nmap` to auto-suggest devices on the LAN.
- **Inter-VLAN routing view** — mirror the router-on-a-stick design with dot1q sub-interfaces.
- **Scheduler** — persist periodic checks to a schedule (the UI auto-refresh already re-pings on a 15 s interval).

---

## License

Released under the MIT License — see the [LICENSE](LICENSE) file for details.

Created as part of a Computer Science internship report (Dilla University, 2026) and shared for educational and demonstration purposes.