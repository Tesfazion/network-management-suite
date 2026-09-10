# Network Management Suite

**Version 2.0.1** | Multi-Tenant SaaS Platform | Enterprise Network Management

A modern, professional network management platform with enterprise-grade features, team collaboration, and real-time monitoring capabilities. Self-hosted, secure, and production-ready.

---

## Overview

Network Management Suite is an enterprise-grade SaaS platform designed for organizations that need to manage, monitor, and document network infrastructure across multiple locations with team collaboration.

**Key Capabilities:**
- Multi-tenant architecture with complete data isolation
- Real-time device monitoring with WebSocket updates
- Team collaboration with role-based access control
- Network topology visualization and documentation
- IP/VLAN management with conflict detection
- Incident tracking and automated alerting

---

## Quick Start

### Prerequisites

- Node.js >= 22.0.0
- PostgreSQL >= 14
- Modern web browser

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/network-management-suite.git
cd network-management-suite

# Install dependencies
npm install

# Configure database (edit .env file)
DATABASE_URL=postgresql://user:password@localhost:5432/network_db

# Setup database schema
npm run setup

# Start server
npm start
```

Access the application at **http://localhost:9090**

**Detailed installation guide:** [COMPLETE-SETUP-GUIDE.md](COMPLETE-SETUP-GUIDE.md)

---

## Core Features

### Authentication & Security
- JWT-based authentication with bcrypt password hashing
- Multi-tenant data isolation (organization-level)
- Role-based access control (Owner, Admin, Member, Viewer)
- SQL injection and XSS protection
- Rate limiting and security headers

### Organization Management
- Multi-organization support with seamless switching
- Team member invitation and management
- Subscription tiers (Free, Pro, Enterprise)
- Activity tracking and audit logs

### Network Monitoring
- Real-time device health checks via ICMP
- WebSocket-powered live updates
- Automated 24/7 monitoring service
- Email and webhook alert integration
- Auto-incident creation for device failures

### Infrastructure Documentation
- Physical layer: Rooms, outlets, patch panels, cable runs
- Logical layer: VLANs, IP addresses, device inventory
- Interactive network topology diagram
- Cable testing and status tracking

### Team Collaboration
- Invite members with role assignment
- Permission-based access to features
- Activity tracking (last login, join date)
- Member management (role changes, removal)

**Complete feature list:** [PROJECT-STATUS.md](PROJECT-STATUS.md)

---

## Documentation

### Getting Started
- [Complete Setup Guide](COMPLETE-SETUP-GUIDE.md) - Detailed installation and configuration
- [Changelog](CHANGELOG.md) - Version history and release notes
- [Latest Changes](LATEST-CHANGES.md) - Recent updates in v2.0.1

### Technical Documentation
- [API Documentation](openapi.yaml) - OpenAPI 3.0 specification
- [Security Policy](docs/SECURITY.md) - Security practices and vulnerability reporting
- [Production Deployment](docs/PRODUCTION-DEPLOYMENT-GUIDE.md) - Cloud and on-premise deployment
- [Enterprise Features](docs/ENTERPRISE-FEATURES.md) - Monitoring and alerting configuration

### Compliance & Quality
- [Software Rules Compliance](SOFTWARE-RULES-COMPLIANCE.md) - OWASP Top 10 and security audit
- [Project Status](PROJECT-STATUS.md) - Current status and roadmap

---

## Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Runtime | Node.js | >= 22.0.0 |
| Web Framework | Express | 5.2.1 |
| Database | PostgreSQL | >= 14 |
| Authentication | JWT + bcrypt | - |
| Real-time | WebSocket (ws) | 8.21.3 |
| Frontend | Vanilla JavaScript | - |

**Full dependency list:** [package.json](package.json)

---

## Configuration

Key environment variables:

```bash
# Server
PORT=9090
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/dbname

# Security (CHANGE THESE!)
JWT_SECRET=your-secret-key-min-32-characters
SESSION_SECRET=your-session-secret-key

# Monitoring
MONITORING_ENABLED=true
MONITORING_INTERVAL=60000

# Email Alerts (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
ALERT_EMAIL=admin@company.com

# Webhooks (Optional)
WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**Complete configuration reference:** [COMPLETE-SETUP-GUIDE.md](COMPLETE-SETUP-GUIDE.md#configuration)

---

## Deployment

### Development
```bash
npm run dev        # Auto-reload on file changes
npm test           # Run test suite
npm run seed       # Load demo data
```

### Production
```bash
npm install --omit=dev
NODE_ENV=production npm start
```

### Docker
```bash
docker-compose up -d --build
```

### Linux Service
```bash
sudo cp deploy/nms.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nms
```

**Detailed deployment guides:** [docs/PRODUCTION-DEPLOYMENT-GUIDE.md](docs/PRODUCTION-DEPLOYMENT-GUIDE.md)

---

## API Reference

RESTful API with JSON responses. All endpoints under `/api`.

### Main Endpoints

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/auth/*` | POST, GET | Authentication (signup, login, logout) |
| `/api/organizations/*` | GET, POST, PUT, DELETE | Organization management |
| `/api/devices/*` | GET, POST, PUT, DELETE | Device inventory |
| `/api/vlans/*` | GET, POST, PUT, DELETE | VLAN management |
| `/api/monitor/*` | GET, POST | Device monitoring |
| `/api/issues/*` | GET, POST, PUT, DELETE | Incident tracking |
| `/api/health` | GET | Health check endpoint |

**Complete API documentation:** [openapi.yaml](openapi.yaml)

---

## Security

### Implemented Protections
- JWT authentication with 7-day token expiration
- Password hashing with bcrypt (10 rounds)
- SQL injection prevention (100% parameterized queries)
- XSS protection with input sanitization
- CSRF protection via JWT tokens
- Rate limiting (configurable per IP)
- Security headers (CSP, X-Frame-Options, etc.)
- Multi-tenant data isolation (org_id filtering on all queries)

### Security Compliance
- OWASP Top 10 (2021) - All items addressed
- GDPR compliance (Privacy Policy included)
- CCPA compliance (California users)

**Security audit report:** [SOFTWARE-RULES-COMPLIANCE.md](SOFTWARE-RULES-COMPLIANCE.md)

**Report vulnerabilities:** [docs/SECURITY.md](docs/SECURITY.md)

---

## Testing

```bash
npm test                      # Run all tests
npm run test:functionality    # Functional tests
npm run lint                  # Code quality check
```

**Test Coverage:**
- Unit tests for API endpoints
- Security test suite
- Rate limiting tests
- Production readiness tests

---

## Project Structure

```
Network Management Suite/
├── server/                   # Backend application
│   ├── routes/              # API endpoints
│   ├── middleware/          # Authentication, security
│   ├── lib/                 # Utilities and helpers
│   └── test/                # Test files
├── public/                   # Frontend application
│   ├── *.html              # Application pages
│   ├── css/                # Stylesheets
│   └── js/                 # Client-side scripts
├── docs/                     # Documentation
├── scripts/                  # Utility scripts
├── deploy/                   # Deployment configurations
└── .env                      # Environment configuration
```

---

## Support

**Organization:** Sunshine Tech Solution IT Teams  
**Email:** sunshinetechsolution4@gmail.com  
**Response Time:** Within 48 hours

### Resources
- Documentation: See [docs/](docs/) folder
- Help Center: [public/help.html](public/help.html)
- Privacy Policy: [public/privacy.html](public/privacy.html)
- Terms of Service: [public/terms.html](public/terms.html)

---

## Contributing

Contributions are welcome. Please follow these steps:

1. Fork the repository
2. Create a feature branch
3. Make your changes with clear commit messages
4. Run tests and ensure they pass
5. Submit a pull request

---

## License

MIT License

Copyright 2026 Sunshine Tech Solution IT Teams

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

## Acknowledgments

Built with modern web technologies. Inspired by enterprise tools including SolarWinds, Nagios, and Zabbix.

---

**Production-Ready** | **Enterprise-Grade** | **Self-Hosted** | **Open Source**
