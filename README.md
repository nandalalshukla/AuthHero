# AuthHero

A **complete, secure, production-ready** authentication server built with Express 5, Prisma, PostgreSQL, and Redis. Supports email/password login, OAuth (Google, GitHub, Facebook), MFA (TOTP), session management, and more.

Use it as a **boilerplate** — scaffold your project and customise to fit your needs.

---

## Features

- **Email / Password** — Register, login, email verification, password reset
- **OAuth 2.0** — Google, GitHub, Facebook with one-time code exchange (no tokens in URLs)
- **Multi-Factor Authentication** — TOTP (authenticator apps) with AES-256-GCM encrypted secrets + backup codes
- **Session Management** — JWT access tokens + rotating HTTP-only refresh tokens stored in PostgreSQL
- **Security Hardened**
  - Argon2id password hashing
  - Rate limiting per route (express-rate-limit)
  - Strict CORS origin whitelist
  - Zod request validation
  - Encrypted MFA secrets at rest
- **Background Jobs** — Async email delivery via BullMQ workers
- **Structured Logging** — Pino with pino-pretty for development
- **Type-Safe** — Fully typed with TypeScript and Zod v4

---

## Tech Stack

| Layer         | Technology                                      |
| ------------- | ----------------------------------------------- |
| Runtime       | Node.js ≥ 18 / Bun                              |
| Framework     | Express 5                                       |
| Database      | PostgreSQL (Prisma 7 with `@prisma/adapter-pg`) |
| Cache / Queue | Redis (ioredis) + BullMQ                        |
| Auth          | JWT (jsonwebtoken) + Argon2                     |
| MFA           | otplib 13 (TOTP) + QRCode                       |
| Validation    | Zod 4                                           |
| Email         | Nodemailer                                      |
| Logging       | Pino                                            |
| Testing       | Vitest + Supertest                              |
| Linting       | ESLint + Prettier                               |

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 18 (or [Bun](https://bun.sh))
- **PostgreSQL** running locally or remotely
- **Redis** running locally or remotely

### 1. Clone & Install

```bash
git clone https://github.com/<your-username>/authhero.git
cd authhero
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Open `.env` and fill in the required values. Generate JWT and MFA secrets:

```bash
# Run this once for each secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Set Up Database

```bash
npx prisma migrate dev
```

### 4. Start the Server

```bash
# Development (with Bun hot-reload)
npm run dev

# Start the email worker in a separate terminal
npm run worker
```

The server starts on `http://localhost:5000` (configurable via `PORT`).

### 5. Verify

```bash
curl http://localhost:5000/health
# → { "status": "ok", "timestamp": "..." }
```

---

## API Endpoints

### Auth — `/auth`

| Method | Path                    | Auth | Description                                        |
| ------ | ----------------------- | ---- | -------------------------------------------------- |
| `POST` | `/auth/register`        | No   | Create a new account                               |
| `POST` | `/auth/login`           | No   | Login with email & password                        |
| `POST` | `/auth/verify-email`    | No   | Verify email with OTP token                        |
| `POST` | `/auth/forgot-password` | No   | Send password reset email                          |
| `POST` | `/auth/reset-password`  | No   | Reset password with token                          |
| `POST` | `/auth/refresh-token`   | No   | Rotate refresh token → new access + refresh tokens |
| `POST` | `/auth/change-password` | Yes  | Change password (requires current password)        |
| `POST` | `/auth/logout`          | Yes  | Revoke current session                             |
| `POST` | `/auth/logout-all`      | Yes  | Revoke all sessions                                |

### OAuth — `/auth/oauth`

| Method | Path                             | Auth | Description                        |
| ------ | -------------------------------- | ---- | ---------------------------------- |
| `GET`  | `/auth/oauth/:provider`          | No   | Get OAuth authorization URL        |
| `GET`  | `/auth/oauth/callback/:provider` | No   | OAuth redirect callback (internal) |
| `POST` | `/auth/oauth/exchange`           | No   | Exchange one-time code for tokens  |

Supported providers: `google`, `github`, `facebook`

### MFA — `/auth/mfa`

| Method | Path                  | Auth | Description                         |
| ------ | --------------------- | ---- | ----------------------------------- |
| `POST` | `/auth/mfa/setup`     | Yes  | Generate QR code + backup codes     |
| `POST` | `/auth/mfa/verify`    | Yes  | Verify TOTP code & enable MFA       |
| `POST` | `/auth/mfa/challenge` | No\* | Complete MFA during login           |
| `POST` | `/auth/mfa/disable`   | Yes  | Disable MFA (requires current TOTP) |

\* Uses a temporary MFA token from the login response.

---

## Project Structure

```
src/
├── app.ts                    # Express app setup & middleware
├── index.ts                  # Server entry point
├── config/                   # Configuration modules
│   ├── cors.ts               # CORS whitelist
│   ├── cookies.ts            # Cookie options
│   ├── email.ts              # Nodemailer transport
│   ├── env.ts                # Zod-validated env vars
│   ├── http.ts               # HTTP status codes
│   ├── jwt.ts                # JWT sign/verify helpers
│   ├── logger.ts             # Pino logger
│   ├── prisma.ts             # Prisma client instance
│   └── redis.ts              # Redis client
├── lib/                      # Shared utilities
│   ├── AppError.ts           # Typed error class
│   ├── asyncHandler.ts       # Express async wrapper
│   └── queues/
│       └── email.queue.ts    # BullMQ email queue
├── middlewares/
│   ├── auth.middleware.ts     # JWT authentication guard
│   ├── error.middleware.ts    # Global error handler
│   ├── mfa.middleware.ts      # MFA enforcement
│   ├── rateLimiter.middleware.ts # Per-route rate limits
│   └── validate.middleware.ts # Zod request validation
├── modules/
│   └── auth/
│       ├── auth.controller.ts
│       ├── auth.routes.ts
│       ├── auth.service.ts
│       ├── auth.types.ts
│       ├── auth.validation.ts
│       ├── mfa/
│       │   ├── mfa.controller.ts
│       │   ├── mfa.crypto.ts    # TOTP, encryption, backup codes
│       │   ├── mfa.routes.ts
│       │   ├── mfa.service.ts
│       │   ├── mfa.types.ts
│       │   └── mfa.validation.ts
│       └── oauth/
│           ├── oauth.controller.ts
│           ├── oauth.routes.ts
│           ├── oauth.service.ts
│           ├── oauth.types.ts
│           └── providers/
│               ├── facebook.provider.ts
│               ├── github.provider.ts
│               └── google.provider.ts
├── utils/
│   ├── email.ts              # Email templates
│   ├── hash.ts               # Argon2 helpers
│   └── rateLimiter.ts        # Rate limiter factory
└── workers/
    └── email.worker.ts       # BullMQ email worker
```

---

## Environment Variables

See [.env.example](.env.example) for the full list. Key variables:

| Variable                                   | Required | Description                           |
| ------------------------------------------ | -------- | ------------------------------------- |
| `DATABASE_URL`                             | Yes      | PostgreSQL connection string          |
| `REDIS_HOST` / `REDIS_PORT`                | Yes      | Redis connection                      |
| `ACCESS_TOKEN_SECRET`                      | Yes      | JWT signing key for access tokens     |
| `REFRESH_TOKEN_SECRET`                     | Yes      | JWT signing key for refresh tokens    |
| `MFA_ENCRYPTION_KEY`                       | Yes      | 64-char hex string for AES-256-GCM    |
| `EMAIL_HOST` / `EMAIL_USER` / `EMAIL_PASS` | Yes      | SMTP credentials                      |
| `APP_URL`                                  | Yes      | Backend URL (used in OAuth redirects) |
| `FRONTEND_URL`                             | No       | Frontend URL (for CORS + redirects)   |
| `GOOGLE_CLIENT_ID` / `SECRET`              | No       | Google OAuth credentials              |
| `GITHUB_CLIENT_ID` / `SECRET`              | No       | GitHub OAuth credentials              |
| `FACEBOOK_CLIENT_ID` / `SECRET`            | No       | Facebook OAuth credentials            |

---

## Scripts

```bash
npm run dev            # Start dev server (Bun watch mode)
npm run worker         # Start email background worker
npm run db:migrate     # Run Prisma migrations
npm run db:generate    # Regenerate Prisma client
npm run db:studio      # Open Prisma Studio
npm run test           # Run tests
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage
npm run lint           # Lint with ESLint
npm run lint:fix       # Auto-fix lint issues
npm run format         # Format with Prettier
npm run format:check   # Check formatting
npm run typecheck      # TypeScript type checking
```

---

## Authentication Flow

### Email / Password

```
1. POST /auth/register     → Account created, verification email sent
2. POST /auth/verify-email → Email verified
3. POST /auth/login        → Returns accessToken + refreshToken (cookie)
4. POST /auth/refresh-token  → Rotate tokens (uses cookie)
```

### OAuth

```
1. GET  /auth/oauth/google       → Returns authorization URL
2. User redirects to Google       → Grants permission
3. GET  /auth/oauth/callback/google → Receives code, stores tokens in Redis
4. Frontend receives one-time code via redirect query param
5. POST /auth/oauth/exchange      → Exchange code for accessToken + refreshToken
```

### MFA (TOTP)

```
1. POST /auth/mfa/setup   → Returns QR code + backup codes
2. User scans QR in authenticator app
3. POST /auth/mfa/verify  → Verify code, enable MFA

On next login:
4. POST /auth/login        → Returns mfaTempToken (no session yet)
5. POST /auth/mfa/challenge → Verify TOTP/backup code → full session
```

---

## Security

- **Passwords** — Hashed with Argon2id (memory-hard, GPU-resistant)
- **MFA Secrets** — Encrypted at rest with AES-256-GCM (not stored as plaintext)
- **Refresh Tokens** — SHA-256 hashed before storage; sent as HTTP-only cookies
- **OAuth** — One-time code exchange via Redis (tokens never appear in URLs)
- **Rate Limiting** — Per-route limits to prevent brute-force attacks
- **CORS** — Strict origin whitelist (no wildcard, no prefix matching)
- **Input Validation** — All endpoints validated with Zod schemas
- **Timing-Safe** — Password comparison uses constant-time comparison via Argon2
- **Email Verification** — Required before account is fully active

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security Policy

If you find a security vulnerability, please see [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

## License

[MIT](LICENSE)
