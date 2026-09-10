# Project File Structure

## Overview
This document describes the organized file structure of the Network Management Suite project.

## Directory Structure

```
Network Management Suite/
│
├── .git/                       # Git repository data
├── .github/                    # GitHub workflows and configurations
│   └── workflows/
│       └── ci.yml             # CI/CD pipeline configuration
│
├── .qodo/                      # Qodo AI integration
│   ├── agents/
│   └── workflows/
│
├── config/                     # Configuration files
│   ├── .dockerignore          # Docker ignore patterns
│   ├── .eslintrc.cjs          # ESLint configuration (legacy)
│   ├── docker-compose.yml     # Docker Compose setup
│   └── Dockerfile             # Docker image definition
│
├── deploy/                     # Deployment files
│   └── nms.service            # Systemd service file for Linux
│
├── docs/                       # Documentation
│   ├── CHANGELOG.md           # Version history and changes
│   ├── FILE-STRUCTURE.md      # This file
│   ├── PRODUCTION_READY.md    # Production deployment guide
│   └── SECURITY.md            # Security policies and guidelines
│
├── logs/                       # Application logs (auto-generated)
│   ├── .025a6aaaaeedce900f45de14c10d0b6925e9f243-audit.json
│   ├── application-YYYY-MM-DD.log
│   └── ... (daily log files)
│
├── node_modules/               # NPM dependencies (auto-generated)
│
├── public/                     # Static frontend files
│   ├── css/
│   │   └── style.css          # Application styles
│   ├── js/
│   │   └── app.js             # Client-side JavaScript
│   └── index.html             # Main HTML page
│
├── scripts/                    # Utility scripts
│   ├── backup.js              # Database backup script
│   ├── clear-cache.js         # Cache-busting version updater
│   └── setup.js               # Initial setup script
│
├── server/                     # Backend application
│   ├── lib/                   # Shared libraries
│   │   ├── errors.js          # Error definitions
│   │   ├── iputil.js          # IP address utilities
│   │   ├── logger.js          # Winston logger setup
│   │   ├── monitor.js         # Network monitoring logic
│   │   ├── pagination.js      # Query pagination helpers
│   │   └── validation.js      # Input validation
│   │
│   ├── middleware/            # Express middleware
│   │   ├── auth.js            # Authentication (future)
│   │   ├── cors.js            # CORS configuration
│   │   ├── errors.js          # Error handling
│   │   ├── rateLimit.js       # Rate limiting
│   │   ├── requestId.js       # Request ID tracking
│   │   └── security.js        # Security headers
│   │
│   ├── routes/                # API route handlers
│   │   ├── dashboard.js       # Dashboard aggregates
│   │   ├── diagram.js         # Network diagram
│   │   ├── export.js          # CSV export
│   │   ├── health.js          # Health check
│   │   ├── index.js           # Route aggregator
│   │   ├── infrastructure.js  # Rooms, outlets, cables
│   │   ├── ipvlan.js          # VLANs and devices
│   │   ├── issues.js          # Incident tracking
│   │   ├── monitoring.js      # Live device monitoring
│   │   ├── search.js          # Global search
│   │   └── setup.js           # Initial setup API
│   │
│   ├── test/                  # Test files
│   │   ├── api.test.js        # API integration tests
│   │   ├── production.test.js # Production readiness tests
│   │   ├── rate-limit.test.js # Rate limiting tests
│   │   └── security.test.js   # Security tests
│   │
│   ├── app.js                 # Express app setup
│   ├── config.js              # Configuration loader
│   ├── db.js                  # Database connection
│   ├── seed-data.js           # Demo data definitions
│   ├── seed.js                # Database seeding script
│   └── server.js              # Application entry point
│
├── .env                        # Environment variables (not in Git)
├── .env.example                # Environment template
├── .gitattributes              # Git attributes
├── .gitignore                  # Git ignore patterns
├── install.bat                 # Windows installation script
├── install.sh                  # Linux/Mac installation script
├── LICENSE                     # MIT License
├── network.db                  # SQLite database (not in Git)
├── package-lock.json           # NPM lock file
├── package.json                # NPM package definition
├── README.md                   # Main documentation
├── README-CACHE-FIX.md         # Cache issue resolution guide
└── test_pg.js                  # PostgreSQL test script
```

## Configuration Files Location

All configuration files have been organized into the `config/` directory:
- Docker configurations
- Linter configurations
- Build configurations

## Documentation Files Location

All markdown documentation is now in the `docs/` directory:
- Changelogs
- Production guides
- Security policies
- Technical documentation

## Key Files

### Root Level
- `package.json` - Project dependencies and scripts
- `.env.example` - Environment variable template
- `README.md` - Main project documentation
- `LICENSE` - MIT License

### Scripts
- `clear-cache.js` - Updates version numbers to bust browser cache
- `backup.js` - Backs up the SQLite database
- `setup.js` - Initial project setup

### Server Entry Points
- `server/server.js` - Main application entry point
- `server/app.js` - Express application configuration
- `server/db.js` - Database connection and initialization

## Auto-Generated Files/Directories

These are created automatically and should not be committed to Git:
- `node_modules/` - NPM packages
- `logs/` - Application log files
- `network.db*` - SQLite database files
- `.env` - Environment variables with secrets

## Build and Deployment

### Development
```bash
npm install        # Install dependencies
npm run setup      # Run initial setup
npm run dev        # Start with auto-reload
```

### Production
```bash
npm install --production  # Install only production deps
npm run setup            # Run setup
npm start                # Start server
```

### Cache Management
```bash
npm run clear-cache      # Update version numbers
npm run fresh-start      # Clear cache and start
```

## Notes

1. Database files (`network.db*`) are excluded from Git
2. Logs are excluded from Git
3. Environment files (`.env`) are excluded from Git
4. Configuration files are centralized in `config/`
5. Documentation is centralized in `docs/`

---

Last updated: September 10, 2026
