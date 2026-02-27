# AuthHero

Drop-in authentication for Express apps. Email/password, OAuth, MFA — all production-ready, fully typed, and secured out of the box.

```bash
npm install @nandalalshukla/auth-hero express
```

```ts
import "dotenv/config";
import { createAuthHero } from "@nandalalshukla/auth-hero";

const auth = await createAuthHero();
auth.app.listen(3000);
```

That's it. You now have register, login, email verification, password reset, OAuth (Google/GitHub/Facebook), MFA (TOTP), session management, and rate limiting — all running on port 3000.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Setup](#quick-setup)
- [Usage](#usage)
  - [Standalone App](#standalone-app)
  - [Mount on Your Own Express App](#mount-on-your-own-express-app)
  - [Protect Your Routes](#protect-your-routes)
  - [Access the Database](#access-the-database)
  - [Graceful Shutdown](#graceful-shutdown)
- [API Reference](#api-reference)
  - [`createAuthHero()`](#createauthhero)
  - [Auth Endpoints](#auth-endpoints)
  - [OAuth Endpoints](#oauth-endpoints)
  - [MFA Endpoints](#mfa-endpoints)
  - [Error Codes](#error-codes)
- [Environment Variables](#environment-variables)
- [Authentication Flows](#authentication-flows)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

---

## Prerequisites

- **Node.js** >= 18
- **PostgreSQL** running locally or remotely
- **Redis** running locally or remotely

---

## Installation

```bash
npm install @nandalalshukla/auth-hero express
```

---

## Quick Setup

### 1. Copy the Prisma schema and run migrations

```bash
cp node_modules/@nandalalshukla/auth-hero/prisma/schema.prisma prisma/schema.prisma
npx prisma migrate dev --name init
```

### 2. Create your `.env` file

```bash
cp node_modules/@nandalalshukla/auth-hero/.env.example .env
```

### 3. Generate secrets

Run this command once for each secret you need to fill in:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Start your app

```ts
import "dotenv/config";
import { createAuthHero } from "@nandalalshukla/auth-hero";

const auth = await createAuthHero();
auth.app.listen(3000, () => console.log("Running on http://localhost:3000"));
```

### 5. Verify it works

```bash
curl http://localhost:3000/health
# { "status": "ok", "timestamp": "2026-02-27T..." }
```

---

## Usage

### Standalone App

Use the built-in Express app. It comes with Helmet, CORS, cookie parsing, rate limiting, all auth routes, and a global error handler — fully configured.

```ts
import "dotenv/config";
import { createAuthHero } from "@nandalalshukla/auth-hero";

const auth = await createAuthHero();

auth.app.listen(3000, () => {
  console.log("AuthHero running on http://localhost:3000");
});
```

### Mount on Your Own Express App

Already have an Express app? Just mount the route modules:

```ts
import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import { createAuthHero } from "@nandalalshukla/auth-hero";

const app = express();
app.use(express.json());
app.use(cookieParser());

const auth = await createAuthHero();

// Mount auth routes
app.use("/auth", auth.routes.auth);
app.use("/auth/oauth", auth.routes.oauth);
app.use("/auth/mfa", auth.routes.mfa);

// Your own routes go here
app.get("/", (_req, res) => res.json({ hello: "world" }));

// Error handler MUST be last
app.use(auth.errorMiddleware);

app.listen(3000);
```

### Protect Your Routes

Use `auth.authenticate` to guard any route with JWT authentication. The user's ID and session ID are available on `req.user`.

```ts
import { createAuthHero } from "@nandalalshukla/auth-hero";

const auth = await createAuthHero();

// Requires a valid access token in the Authorization header
app.get("/me", auth.authenticate, async (req, res) => {
  const user = await auth.prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true, emailVerified: true, mfaEnabled: true },
  });
  res.json(user);
});

// Requires valid access token + verified MFA
app.delete("/account", auth.authenticate, auth.requireMFA, async (req, res) => {
  await auth.prisma.user.delete({ where: { id: req.user!.userId } });
  res.json({ deleted: true });
});
```

### Access the Database

The `auth.prisma` client gives you full access to the database. Use it for custom queries alongside AuthHero's built-in operations.

```ts
// Get all users
const users = await auth.prisma.user.findMany({
  select: { id: true, email: true, createdAt: true },
});

// Get user count
const count = await auth.prisma.user.count();
```

### Graceful Shutdown

Call `auth.shutdown()` to close database, Redis, and email worker connections cleanly.

```ts
const auth = await createAuthHero();
const server = auth.app.listen(3000);

process.on("SIGTERM", async () => {
  server.close();
  await auth.shutdown();
  process.exit(0);
});
```

---

## API Reference

### `createAuthHero()`

Returns a `Promise<AuthHero>` with the following properties:

| Property          | Type                  | Description                                        |
| ----------------- | --------------------- | -------------------------------------------------- |
| `app`             | `Express`             | Full Express app with all routes and middleware    |
| `routes.auth`     | `Router`              | Auth routes — register, login, verify, reset, etc. |
| `routes.oauth`    | `Router`              | OAuth routes — Google, GitHub, Facebook            |
| `routes.mfa`      | `Router`              | MFA routes — setup, verify, challenge, disable     |
| `authenticate`    | `RequestHandler`      | JWT middleware — protects routes                   |
| `requireMFA`      | `RequestHandler`      | MFA enforcement middleware                         |
| `errorMiddleware` | `ErrorRequestHandler` | Error handler — must be the last middleware        |
| `prisma`          | `PrismaClient`        | Database client for custom queries                 |
| `shutdown()`      | `() => Promise<void>` | Close all connections gracefully                   |

### Auth Endpoints

All routes are prefixed with `/auth` when using the standalone app.

| Method | Path               | Auth | Body                               | Description                 |
| ------ | ------------------ | ---- | ---------------------------------- | --------------------------- |
| POST   | `/register`        | No   | `{ email, password }`              | Create account              |
| POST   | `/login`           | No   | `{ email, password }`              | Login                       |
| POST   | `/verify-email`    | No   | `{ token }`                        | Verify email address        |
| POST   | `/forgot-password` | No   | `{ email }`                        | Send reset email            |
| POST   | `/reset-password`  | No   | `{ token, newPassword }`           | Reset password              |
| POST   | `/change-password` | Yes  | `{ currentPassword, newPassword }` | Change password             |
| POST   | `/refresh-token`   | No   | —                                  | Rotate tokens (uses cookie) |
| POST   | `/logout`          | Yes  | —                                  | Revoke current session      |
| POST   | `/logout-all`      | Yes  | —                                  | Revoke all sessions         |

**Password requirements:** min 8 chars, at least one lowercase, one uppercase, one digit, one special character.

### OAuth Endpoints

Prefixed with `/auth/oauth`. Supported providers: `google`, `github`, `facebook`.

| Method | Path                  | Description                        |
| ------ | --------------------- | ---------------------------------- |
| GET    | `/:provider`          | Get OAuth authorization URL        |
| GET    | `/callback/:provider` | OAuth redirect callback (internal) |
| POST   | `/exchange`           | Exchange one-time code for tokens  |

**OAuth flow:**

1. Frontend calls `GET /auth/oauth/google` → gets an authorization URL
2. Redirect user to that URL → user grants permission
3. Provider redirects to callback → AuthHero stores tokens in Redis
4. Frontend receives a one-time code via redirect query param
5. Frontend calls `POST /auth/oauth/exchange` with the code → gets access + refresh tokens

### MFA Endpoints

Prefixed with `/auth/mfa`. Uses TOTP (compatible with Google Authenticator, Authy, etc.)

| Method | Path         | Auth  | Body                  | Description                |
| ------ | ------------ | ----- | --------------------- | -------------------------- |
| POST   | `/setup`     | Yes   | —                     | Get QR code + backup codes |
| POST   | `/verify`    | Yes   | `{ code }`            | Verify TOTP and enable MFA |
| POST   | `/challenge` | Token | `{ tempToken, code }` | Complete MFA during login  |
| POST   | `/disable`   | Yes   | `{ code }`            | Disable MFA                |

**MFA login flow:**

1. `POST /auth/login` → returns `{ mfaRequired: true, tempToken: "..." }`
2. `POST /auth/mfa/challenge` with the temp token + TOTP code → returns access + refresh tokens

### Error Codes

All errors follow a consistent format:

```json
{
  "success": false,
  "message": "Human-readable message",
  "errorCode": "MACHINE_READABLE_CODE"
}
```

| Code                   | Description                               |
| ---------------------- | ----------------------------------------- |
| `INVALID_CREDENTIALS`  | Wrong email or password                   |
| `EMAIL_NOT_VERIFIED`   | Email address not yet verified            |
| `EMAIL_ALREADY_EXISTS` | Account with this email already exists    |
| `TOKEN_EXPIRED`        | JWT or verification token has expired     |
| `TOKEN_INVALID`        | Token is malformed or tampered with       |
| `TOKEN_ALREADY_USED`   | One-time token was already consumed       |
| `SESSION_REVOKED`      | Session was revoked (logged out)          |
| `SESSION_EXPIRED`      | Session has expired                       |
| `RATE_LIMIT_EXCEEDED`  | Too many requests                         |
| `MFA_REQUIRED`         | MFA verification needed to complete login |
| `MFA_INVALID_CODE`     | Wrong TOTP code or backup code            |
| `MFA_NOT_SETUP`        | MFA is not set up for this account        |
| `VALIDATION_FAILED`    | Request body failed Zod validation        |

You can catch these in your frontend:

```ts
if (error.errorCode === "EMAIL_NOT_VERIFIED") {
  showResendVerificationUI();
}
```

---

## Environment Variables

Create a `.env` file with the following variables. All JWT/MFA secrets should be random 64-character hex strings.

| Variable                    | Required | Default                 | Description                                   |
| --------------------------- | -------- | ----------------------- | --------------------------------------------- |
| `DATABASE_URL`              | Yes      | —                       | PostgreSQL connection string                  |
| `REDIS_HOST`                | Yes      | `localhost`             | Redis host                                    |
| `REDIS_PORT`                | Yes      | `6379`                  | Redis port                                    |
| `PORT`                      | No       | `5000`                  | Server port                                   |
| `NODE_ENV`                  | No       | `development`           | `development` / `production` / `test`         |
| `ACCESS_TOKEN_SECRET`       | Yes      | —                       | JWT signing key for access tokens             |
| `REFRESH_TOKEN_SECRET`      | Yes      | —                       | JWT signing key for refresh tokens            |
| `VERIFY_EMAIL_TOKEN_SECRET` | Yes      | —                       | JWT key for email verification tokens         |
| `FORGOT_PSWD_TOKEN_SECRET`  | Yes      | —                       | JWT key for forgot password tokens            |
| `RESET_PSWD_TOKEN_SECRET`   | Yes      | —                       | JWT key for reset password tokens             |
| `MFA_ENCRYPTION_KEY`        | Yes      | —                       | 64-char hex string for AES-256-GCM encryption |
| `MFA_TEMP_TOKEN_SECRET`     | Yes      | —                       | JWT key for temporary MFA tokens              |
| `EMAIL_HOST`                | Yes      | `smtp.gmail.com`        | SMTP server hostname                          |
| `EMAIL_PORT`                | Yes      | `465`                   | SMTP server port                              |
| `EMAIL_USER`                | Yes      | —                       | SMTP username/email                           |
| `EMAIL_PASS`                | Yes      | —                       | SMTP password or app password                 |
| `APP_URL`                   | Yes      | `http://localhost:5000` | Backend URL (used in OAuth redirects)         |
| `FRONTEND_URL`              | No       | —                       | Frontend URL (for CORS + redirects)           |
| `GOOGLE_CLIENT_ID`          | No       | —                       | Google OAuth client ID                        |
| `GOOGLE_CLIENT_SECRET`      | No       | —                       | Google OAuth client secret                    |
| `GOOGLE_REDIRECT_URI`       | No       | —                       | Google OAuth callback URL                     |
| `GITHUB_CLIENT_ID`          | No       | —                       | GitHub OAuth client ID                        |
| `GITHUB_CLIENT_SECRET`      | No       | —                       | GitHub OAuth client secret                    |
| `GITHUB_REDIRECT_URI`       | No       | —                       | GitHub OAuth callback URL                     |
| `FACEBOOK_CLIENT_ID`        | No       | —                       | Facebook OAuth client ID                      |
| `FACEBOOK_CLIENT_SECRET`    | No       | —                       | Facebook OAuth client secret                  |
| `FACEBOOK_REDIRECT_URI`     | No       | —                       | Facebook OAuth callback URL                   |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Authentication Flows

### Email / Password

```
POST /auth/register      → Account created, verification email sent
POST /auth/verify-email   → Email verified
POST /auth/login          → Returns accessToken + refreshToken (HTTP-only cookie)
POST /auth/refresh-token  → Rotate tokens (reads cookie)
POST /auth/logout         → Revoke current session
```

### OAuth

```
GET  /auth/oauth/google        → Authorization URL
  → User redirects to Google   → Grants permission
GET  /auth/oauth/callback/google → One-time code stored in Redis
  → Frontend receives code via redirect
POST /auth/oauth/exchange       → Exchange code → accessToken + refreshToken
```

### MFA (TOTP)

```
# Setup
POST /auth/mfa/setup    → QR code (base64) + backup codes
  → User scans QR in authenticator app
POST /auth/mfa/verify   → Verify TOTP code → MFA enabled

# Login with MFA
POST /auth/login         → { mfaRequired: true, tempToken: "..." }
POST /auth/mfa/challenge → Verify TOTP → full session tokens
```

---

## Security

AuthHero is built with security as a first-class concern:

- **Argon2id** — Memory-hard password hashing (GPU-resistant)
- **AES-256-GCM** — MFA secrets encrypted at rest (never stored as plaintext)
- **SHA-256 hashed refresh tokens** — Stored hashed in the database, sent as HTTP-only secure cookies
- **One-time OAuth codes** — Tokens never appear in URLs; exchanged via Redis with short TTLs
- **Per-route rate limiting** — Prevents brute-force attacks on login, register, password reset
- **Strict CORS** — Origin whitelist (no wildcards, no prefix matching)
- **Zod validation** — Every request body validated before processing
- **Constant-time comparison** — Password verification via Argon2's built-in timing-safe compare
- **Helmet** — Security headers (CSP, HSTS, X-Content-Type-Options, etc.)

---

## Boilerplate Mode

Want to fork and customize instead of using it as a package? Clone the repo directly:

```bash
git clone https://github.com/nandalalshukla/authhero.git my-app
cd my-app
npm install
cp .env.example .env
# Fill in your .env values
npx prisma migrate dev
npm run dev
```

This gives you the full source code so you can modify anything — routes, validation, email templates, database schema, etc.

---

## Tech Stack

| Layer         | Technology                                   |
| ------------- | -------------------------------------------- |
| Runtime       | Node.js >= 18                                |
| Framework     | Express 5                                    |
| Database      | PostgreSQL (Prisma 7 + `@prisma/adapter-pg`) |
| Cache / Queue | Redis (ioredis) + BullMQ                     |
| Auth          | JWT (jsonwebtoken) + Argon2                  |
| MFA           | otplib (TOTP) + QRCode                       |
| Validation    | Zod 4                                        |
| Email         | Nodemailer                                   |
| Logging       | Pino                                         |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security Policy

Found a vulnerability? See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

## License

[MIT](LICENSE)
