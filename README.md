# Network Management Suite

![Node.js](https://img.shields.io/badge/Node.js-Express%205-339933?style=flat)
![Database](https://img.shields.io/badge/SQLite-better--sqlite3-blue?style=flat)
![Frontend](https://img.shields.io/badge/Frontend-Vanilla%20JS-orange?style=flat)
![License](https://img.shields.io/badge/license-MIT-green?style=flat)

**Document · Administer · Monitor**

A self-hosted web platform for documenting, administering, and monitoring office network infrastructure. Built during a 9-week networking internship at the Wolayita Zone Innovation and Technology office (South Ethiopia Region).

---

## What It Does

The Suite replaces spreadsheet-based cable logs, hand-written IP records, and scattered documentation with a single integrated dashboard.

| Area | What It Records |
|------|-----------------|
| **Physical** | Cabling plant: rooms, outlets, patch panels, cable runs |
| **Logical** | VLAN design, device inventory with IP/MAC/VLAN bindings |
| **Live** | Device health via ICMP ping, RTT, and history |
| **Operational** | Incidents and support requests with lifecycle tracking |

## Who It's For

- **Network technicians** wiring buildings and needing clean documentation
- **SMEs and government offices** running small–medium LANs
- **Students** studying full-stack development with a realistic project
- **IT teams** still using spreadsheets for network inventory

## Key Features

- **Infrastructure Documentation** — Rooms, outlets, patch panels, cable runs with test results (Pass/Fail/Pending)
- **IP & VLAN Administration** — VLAN register, device inventory with MAC and location, per-device monitoring toggle
- **Live Monitoring** — One-click ICMP ping, UP/DOWN status, RTT, per-device history, optional auto-refresh
- **Incident Tracking** — Open → In Progress → Resolved workflow with severity, linked devices/outlets, and resolution timestamps
- **Conflict Detection** — Automatic alerts for duplicate IPs, out-of-subnet devices, and gateway squatting
- **Visual Diagram Editor** — Drag-and-drop SVG canvas with zones, device icons, live status coloring, and auto-save
- **Global Search** — Search across devices, cables, outlets, rooms, VLANs, and incidents
- **CSV Export** — One-click export of cable log and device inventory
- **Setup Wizard** — First-run organization branding and optional demo data loading

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js + Express 5 |
| Database | SQLite via `better-sqlite3` |
| Monitoring | OS `ping` (ICMP) via `child_process` |
| Frontend | Vanilla HTML5, CSS3, JavaScript (no build step) |
| Tests | Node.js built-in test runner (`node --test`) |

---

## Prerequisites

- [Node.js](https://nodejs.org/) **≥ 22** (developed and tested on Node 24)
- `npm` (bundled with Node.js)
- A system `ping` command on `PATH` (standard on Windows, macOS, and Linux)

---

## Installation

### Windows

```bash
install.bat
```

### Linux / macOS

```bash
bash install.sh
```

### Manual

```bash
npm install
npm run seed   # optional: load demo data
npm start
```

---

## Running

```bash
npm start
```

Open your browser at **http://localhost:8080**.

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8080` | HTTP listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `AUTH_TOKEN` | _(none)_ | Bearer token for API protection |
| `DATABASE_PATH` | `./network.db` | SQLite file location |
| `BODY_LIMIT` | `1mb` | JSON body size limit |

---

## First-Run Setup

On first launch, the app shows a setup wizard:

1. Enter your **organization name** (shown in the sidebar and browser title)
2. Optionally load the **demonstration network** to explore every feature

You can also configure the organization later from the sidebar footer, or headlessly:

```bash
npm run setup -- --org="Acme Office Network" --demo
```

---

## Testing

```bash
npm test
```

The test suite uses Node's built-in test runner and covers:

- Room CRUD and cascade deletes
- Foreign key integrity (cables survive room deletion)
- Monitoring flag normalization
- PATCH semantics
- Live monitoring with real ping
- Dashboard aggregates and uptime
- Incident lifecycle (Open → In Progress → Resolved)
- Conflict detection (duplicate IPs, out-of-subnet, gateway squatting)
- Global search
- CSV export headers
- Diagram persistence (nodes, links, zones)
- Setup wizard and demo seeding
- Security headers and Bearer auth

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
│   ├── lib/
│   │   ├── monitor.js      # ICMP ping wrapper
│   │   └── iputil.js       # IP/CIDR helpers + conflict detection
│   ├── config.js           # Environment-driven configuration
│   ├── app.js              # Express middleware + security headers
│   ├── server.js           # HTTP server + graceful shutdown
│   ├── middleware/         # Auth, security, error handling
│   ├── routes/             # All REST API route modules
│   └── test/               # Automated API + security tests
└── public/
    ├── index.html          # Single-page dashboard
    ├── css/
    │   └── style.css       # Professional dark theme
    └── js/
        └── app.js          # Frontend logic (views, CRUD, monitoring, diagram, setup)
```

---

## API Reference

All endpoints return JSON under `/api`.

### Rooms
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/rooms` | List rooms |
| POST | `/api/rooms` | Create room |
| DELETE | `/api/rooms/:id` | Delete room (cascade) |

### Outlets
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/outlets` | List outlets |
| POST | `/api/outlets` | Create outlet |
| DELETE | `/api/outlets/:id` | Delete outlet |

### Patch Panels
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/patchpanels` | List panels |
| POST | `/api/patchpanels` | Create panel |
| DELETE | `/api/patchpanels/:id` | Delete panel |

### Cables
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cables` | List cable runs |
| POST | `/api/cables` | Create cable run |
| PATCH | `/api/cables/:id` | Update test result / status |
| DELETE | `/api/cables/:id` | Delete cable run |

### VLANs
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/vlans` | List VLANs |
| POST | `/api/vlans` | Create VLAN |

### Devices
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/devices` | List devices |
| POST | `/api/devices` | Create device |
| PATCH | `/api/devices/:id` | Update device |
| DELETE | `/api/devices/:id` | Delete device |

### Monitoring
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/monitor/check/:id` | Ping one device |
| POST | `/api/monitor/check-all` | Ping all monitored devices |
| GET | `/api/monitor/status` | Latest status per device |
| GET | `/api/monitor/history/:id` | Last 50 checks for a device |

### Incidents
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/issues` | List incidents |
| POST | `/api/issues` | Create incident |
| PATCH | `/api/issues/:id` | Update incident |
| DELETE | `/api/issues/:id` | Delete incident |

### Audits & Search
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/conflicts` | Duplicate IPs, out-of-subnet, gateway squatting |
| GET | `/api/search?q=` | Global search across all entities |

### Diagram
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/diagram` | Load saved canvas state |
| PUT | `/api/diagram` | Persist canvas (zones, nodes, links) |

### Setup & Organization
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/setup` | Check if configured |
| POST | `/api/setup` | Store org name, optionally load demo |
| GET | `/api/settings` | Current organization settings |

### Exports
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/export/cables.csv` | Cable log CSV |
| GET | `/api/export/devices.csv` | Device inventory CSV |

### Utility
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Liveness check |
| GET | `/api/dashboard` | Aggregate counts and uptime |

---

## Example Usage

```bash
# Create a VLAN
curl -X POST http://localhost:8080/api/vlans \
  -H "Content-Type: application/json" \
  -d '{"vlan_id": 10, "name": "Admin", "subnet": "192.168.10.0/24", "gateway": "192.168.10.1"}'

# Create a device
curl -X POST http://localhost:8080/api/devices \
  -H "Content-Type: application/json" \
  -d '{"name": "PC-01", "ip": "192.168.10.10", "device_type": "Workstation", "vlan_id": 1}'

# Ping a device
curl -X POST http://localhost:8080/api/monitor/check/1
```

---

## Deployment

### Production Checklist

1. Install Node.js ≥ 22 on the target machine
2. Run `npm install --omit=dev`
3. Optionally pre-configure: `npm run setup -- --org="Your Org" --demo`
4. Start: `npm start` (or use the systemd unit in `deploy/nms.service` for Linux)
5. Open `http://<server-ip>:8080`

### Linux Service

```bash
sudo cp deploy/nms.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nms
```

---

## Security

- **Optional Bearer Authentication**: Set `AUTH_TOKEN` to require `Authorization: Bearer <token>` for API access
- **Security Headers**: CSP, X-Frame-Options, X-Content-Type-Options, COOP/CORP applied to every response
- **Database**: Protect `network.db` with filesystem permissions; it contains all recorded data
- **Git**: `network.db` and `.env` are gitignored

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `npm install` fails on Windows | `better-sqlite3` needs build tools | Install Visual Studio Build Tools or use WSL |
| Port 8080 in use | Another process | Set `PORT=9090 npm start` |
| Ping checks always `down` on demo data | Demo uses private IPs | Add a device with IP `127.0.0.1` to verify |
| Database locked | Server still running | Stop the server before deleting `network.db*` |
| Setup wizard loops | Corrupt database | Delete `network.db*` and restart |

---

## License

MIT License — see the [LICENSE](LICENSE) file for details.

Created as part of a Computer Science internship report (Dilla University, 2026) and shared for educational and demonstration purposes.
