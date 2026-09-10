# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | Yes                |
| < 2.0   | No                 |

## Reporting a Vulnerability

If you discover a security vulnerability in Network Management Suite, please report it responsibly:

1. **Do not** open a public issue on GitHub.
2. Email security details to **security@example.com** (replace with actual contact).
3. Include:
   - A description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix if available

We will acknowledge receipt within 3 business days and provide a detailed response within 10 business days.

## Security Best Practices for Deployments

- Always set `AUTH_TOKEN` in production to protect the API
- Run behind a reverse proxy with HTTPS termination (nginx, Caddy, etc.)
- Keep Node.js updated to the latest LTS release
- Regularly run `npm audit` and apply patches
- Restrict filesystem permissions on `logs/` and PostgreSQL data directory
- Use strong passwords for PostgreSQL and restrict access to port 5432
- Use firewall rules to limit access to port 8080
- Enable `LOG_FORMAT=json` and ship logs to a SIEM or log aggregator
