# AuthHero Documentation

> Complete, secure, production-ready authentication for Express apps. Email/password, OAuth (Google/GitHub/Facebook), MFA (TOTP), session management — all fully typed and secured out of the box.

---

## Documentation Index

### Getting Started

| Document                                | Description                                                 |
| --------------------------------------- | ----------------------------------------------------------- |
| [Getting Started](./getting-started.md) | Installation, quick setup, first request in under 5 minutes |
| [Configuration](./configuration.md)     | Every environment variable explained with examples          |
| [Database Schema](./database.md)        | Prisma models, relationships, and migration guide           |

### Core Guides

| Document                                          | Description                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------- |
| [Architecture Overview](./architecture.md)        | Project structure, design patterns, data flow diagrams            |
| [API Reference](./api-reference.md)               | Every endpoint — request/response formats, status codes, examples |
| [Authentication Flows](./authentication-flows.md) | Step-by-step walkthroughs of every auth flow                      |

### Feature Guides

| Document                                    | Description                                                     |
| ------------------------------------------- | --------------------------------------------------------------- |
| [OAuth Setup](./oauth-setup.md)             | Configure Google, GitHub, Facebook OAuth with screenshots       |
| [MFA (TOTP) Guide](./mfa-guide.md)          | Multi-factor authentication setup, challenge flow, backup codes |
| [Frontend Integration](./frontend-guide.md) | Next.js reference client — store, hooks, API, components        |

### Advanced

| Document                                            | Description                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| [Security Deep Dive](./security.md)                 | Every security measure explained — why it exists and how it works   |
| [Error Handling](./error-handling.md)               | Error codes, structured responses, frontend error handling patterns |
| [Source Code Reference](./source-code-reference.md) | File-by-file walkthrough of the entire codebase                     |
| [Deployment Guide](./deployment.md)                 | Production checklist, Docker, environment setup                     |

---

## Quick Overview

### What AuthHero Provides

- **Email/Password Authentication** — Register, login, email verification, password reset/change
- **OAuth 2.0** — Google, GitHub, Facebook (Strategy Pattern — easy to add more)
- **Multi-Factor Authentication** — TOTP (Google Authenticator/Authy compatible) with backup codes
- **Session Management** — JWT access tokens + rotating refresh tokens with reuse detection
- **Rate Limiting** — Per-route Redis-backed rate limiters
- **Security First** — Argon2id hashing, AES-256-GCM encryption, Helmet, strict CORS, timing-attack protection

### Two Ways to Use

**1. Standalone Server** — Run as a complete auth server:

```ts
import "dotenv/config";
import { createAuthHero } from "@nandalalshukla/auth-hero";

const auth = await createAuthHero();
auth.app.listen(3000);
```

**2. Library Mode** — Mount on your existing Express app:

```ts
const auth = await createAuthHero();
myApp.use("/auth", auth.routes.auth);
myApp.use("/auth/oauth", auth.routes.oauth);
myApp.use("/auth/mfa", auth.routes.mfa);
myApp.use(auth.errorMiddleware);
```

### CLI Scaffolder

```bash
npx create-authhero my-app
cd my-app
npm run dev
```

Generates a full project with auto-generated secrets, `.env` file, and everything ready to go.

---

## Tech Stack

| Layer         | Technology                      | Purpose                                 |
| ------------- | ------------------------------- | --------------------------------------- |
| Runtime       | Node.js >= 18                   | Server runtime                          |
| Framework     | Express 5                       | HTTP framework                          |
| Language      | TypeScript (strict mode)        | Type safety                             |
| Database      | PostgreSQL                      | Primary data store                      |
| ORM           | Prisma 7 + `@prisma/adapter-pg` | Database access                         |
| Cache / Queue | Redis (ioredis) + BullMQ        | Rate limiting, job queue, OAuth codes   |
| Auth          | JWT (jsonwebtoken) + Argon2     | Token generation + password hashing     |
| MFA           | otplib (TOTP) + QRCode          | Time-based one-time passwords           |
| Encryption    | AES-256-GCM (Node crypto)       | TOTP secret encryption at rest          |
| Validation    | Zod 4                           | Request body validation                 |
| Email         | Nodemailer + BullMQ worker      | Async email delivery                    |
| Logging       | Pino                            | Structured JSON logging                 |
| Security      | Helmet + express-rate-limit     | HTTP headers + brute-force protection   |
| Build         | tsup                            | Library bundling (ESM, DTS, sourcemaps) |
| Testing       | Vitest + Supertest              | Unit + integration tests                |

---

## Repository Structure

```
authhero-server/
├── src/
│   ├── index.ts                     # Library entry point (public API)
│   ├── createAuthHero.ts            # Factory function — initializes everything
│   ├── server.ts                    # Standalone server with graceful shutdown
│   ├── app.ts                       # Express app setup
│   ├── config/                      # Configuration modules
│   │   ├── env.ts                   # Zod-validated environment variables
│   │   ├── jwt.ts                   # JWT generation/verification
│   │   ├── constants.ts             # Token lengths, expiry durations
│   │   ├── cookies.ts               # Cookie options (httpOnly, secure)
│   │   ├── cors.ts                  # CORS with origin whitelist
│   │   ├── http.ts                  # HTTP status code constants
│   │   ├── prisma.ts                # PrismaClient initialization
│   │   ├── redis.ts                 # Redis client + BullMQ connection
│   │   └── email.ts                 # Nodemailer transporter
│   ├── lib/                         # Shared libraries
│   │   ├── AppError.ts              # Custom error class + error codes
│   │   ├── asyncHandler.ts          # Express async error wrapper
│   │   ├── logger.ts                # Pino structured logger
│   │   ├── session.ts               # Centralized session creation
│   │   └── queues/
│   │       └── email.queue.ts       # BullMQ email queue
│   ├── middlewares/                  # Express middlewares
│   │   ├── auth.middleware.ts        # JWT authentication
│   │   ├── mfa.middleware.ts         # MFA enforcement
│   │   ├── error.middleware.ts       # Global error handler
│   │   ├── validate.middleware.ts    # Zod validation factory
│   │   └── rateLimiter.middleware.ts # Pre-configured rate limiters
│   ├── modules/
│   │   └── auth/
│   │       ├── auth.service.ts       # Core auth business logic
│   │       ├── auth.controller.ts    # Express route handlers
│   │       ├── auth.routes.ts        # Route definitions
│   │       ├── auth.validation.ts    # Zod request schemas
│   │       ├── auth.types.ts         # TypeScript interfaces
│   │       ├── mfa/
│   │       │   ├── mfa.crypto.ts     # TOTP, AES encryption, backup codes
│   │       │   ├── mfa.service.ts    # MFA business logic
│   │       │   ├── mfa.controller.ts # MFA route handlers
│   │       │   ├── mfa.routes.ts     # MFA route definitions
│   │       │   └── mfa.validation.ts # MFA Zod schemas
│   │       └── oauth/
│   │           ├── oauth.service.ts  # OAuth user sync logic
│   │           ├── oauth.controller.ts# OAuth route handlers
│   │           ├── oauth.routes.ts   # OAuth route definitions
│   │           ├── oauth.types.ts    # OAuth interfaces
│   │           └── providers/
│   │               ├── google.provider.ts
│   │               ├── github.provider.ts
│   │               └── facebook.provider.ts
│   ├── utils/                       # Utility functions
│   │   ├── hash.ts                  # Argon2 password hashing
│   │   ├── email.ts                 # Email sending with HTML template
│   │   ├── rateLimiter.ts           # Redis-backed rate limiter factory
│   │   └── requireAuth.ts           # TypeScript assertion helper
│   └── workers/
│       └── email.worker.ts          # BullMQ email worker
├── prisma/
│   ├── schema.prisma                # Database schema
│   └── migrations/                  # Migration history
├── tests/                           # Vitest test suite
├── packages/
│   └── create-authhero/             # CLI scaffolder
├── package.json
├── tsconfig.json
├── tsup.config.ts                   # Build configuration
├── vitest.config.ts                 # Test configuration
└── .env.example                     # Environment template
```

---

## Need Help?

- Open an issue on [GitHub](https://github.com/nandalalshukla/authhero/issues)
- See [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines
- See [SECURITY.md](../SECURITY.md) for vulnerability reporting
