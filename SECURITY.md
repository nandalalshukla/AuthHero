# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅        |

## Reporting a Vulnerability

If you discover a security vulnerability in AuthHero, **please do NOT open a public GitHub issue**.

Instead, report it responsibly:

1. **Email:** Send details to the repository owner (see the GitHub profile)
2. **Include:**
   - A description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if you have one)

You should receive an acknowledgment within **48 hours**. We will work with you to understand the issue and coordinate a fix before any public disclosure.

## Security Best Practices for Deployers

When deploying AuthHero in production, make sure to:

- [ ] Generate unique, high-entropy secrets for all `*_SECRET` and `*_KEY` env vars
- [ ] Use HTTPS in production (terminate TLS at your reverse proxy)
- [ ] Set `NODE_ENV=production`
- [ ] Restrict `ALLOWED_ORIGINS` to your exact frontend domain(s)
- [ ] Keep dependencies up to date (`npm audit`)
- [ ] Run the server behind a reverse proxy (nginx, Caddy, etc.)
- [ ] Enable PostgreSQL SSL connections in production
- [ ] Store `.env` securely — never commit it to version control
- [ ] Review rate limiter settings for your expected traffic

## Scope

The following are in scope for security reports:

- Authentication bypass
- Token leakage or exposure
- Injection vulnerabilities (SQL, NoSQL, command)
- Cryptographic weaknesses
- Authorization flaws
- Information disclosure
- Rate limiting bypass

## Acknowledgments

We appreciate security researchers who help make AuthHero safer. Contributors who report valid vulnerabilities will be credited in the project (unless they prefer to remain anonymous).
