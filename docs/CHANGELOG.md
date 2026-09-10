# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- ESLint configuration and `npm run lint` script for code quality enforcement
- Request correlation IDs (`X-Request-ID`) for tracing requests across logs
- File-based log rotation via `winston` and `winston-daily-rotate-file`
- Liveness and readiness health probes (`/health/live`, `/health/ready`)
- API versioning prefix `/api/v1` for backward-compatible evolution
- DOMPurify integration for frontend XSS defense-in-depth
- OpenAPI 3.0 specification (`openapi.yaml`) describing all endpoints
- GitHub Actions CI pipeline for automated lint, test, and audit
- Dependabot configuration for automated dependency patch PRs
- `CHANGELOG.md` and `SECURITY.md` for release and vulnerability tracking

### Changed
- Upgraded logging from console-only to structured Winston transport with daily rotation
- Environment validation now fails fast on invalid `PORT` values
- API routes mounted under both `/api` (legacy) and `/api/v1` (canonical)

## [2.0.0] - 2026-09-08

### Added
- Initial public release under MIT license
- Full CRUD for rooms, outlets, patch panels, cables, VLANs, devices, and incidents
- Live ICMP device monitoring with history and auto-refresh
- Interactive SVG network diagram editor with zones and drag-and-drop
- IP conflict detection (duplicates, out-of-subnet, gateway squatting)
- CSV export for cable logs and device inventory
- Optional Bearer token authentication
- Rate limiting per client IP
- Security headers: CSP, X-Frame-Options, X-Content-Type-Options, COOP/CORP
- Dockerfile, docker-compose, and systemd unit for production deployment
- 35+ integration tests using Node.js built-in test runner
