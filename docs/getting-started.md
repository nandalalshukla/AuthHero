# Getting Started

Get AuthHero running in under 5 minutes. This guide covers everything from installation to your first API request.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Option 1: CLI Scaffolder (Recommended)](#option-1-cli-scaffolder-recommended)
- [Option 2: npm Package](#option-2-npm-package)
- [Option 3: Clone the Repository](#option-3-clone-the-repository)
- [Database Setup](#database-setup)
- [Redis Setup](#redis-setup)
- [Email Configuration](#email-configuration)
- [Running the Server](#running-the-server)
- [Verify It Works](#verify-it-works)
- [Your First API Requests](#your-first-api-requests)
- [Next Steps](#next-steps)

---

## Prerequisites

Before you begin, make sure you have:

| Requirement        | Version            | Check Command    |
| ------------------ | ------------------ | ---------------- |
| **Node.js**        | >= 18.0.0          | `node --version` |
| **PostgreSQL**     | Any recent version | `psql --version` |
| **Redis**          | Any recent version | `redis-cli ping` |
| **npm** or **bun** | Latest             | `npm --version`  |

---

## Option 1: CLI Scaffolder (Recommended)

The fastest way to get started. Creates a complete project with auto-generated secrets.

```bash
npx create-authhero my-auth-server
cd my-auth-server
```

### What the CLI does:

1. **Clones** the AuthHero template into `my-auth-server/`
2. **Generates** cryptographic secrets automatically (JWT keys, MFA encryption key)
3. **Creates** a `.env` file from `.env.example` with secrets pre-filled
4. **Installs** all npm dependencies
5. **Initializes** a fresh git repository

### After scaffolding:

```bash
# 1. Edit .env — set your DATABASE_URL, EMAIL_USER, EMAIL_PASS
#    (secrets are already generated for you)

# 2. Run database migrations
npx prisma migrate dev --name init

# 3. Start the server
npm run dev

# 4. In a separate terminal, start the email worker
npm run worker
```

---

## Option 2: npm Package

Install AuthHero as a dependency in your existing project.

### Step 1: Install

```bash
npm install @nandalalshukla/auth-hero express
```

### Step 2: Copy the Prisma schema

AuthHero ships its Prisma schema inside the package. Copy it to your project:

```bash
# Create the prisma directory if it doesn't exist
mkdir -p prisma

# Copy the schema
cp node_modules/@nandalalshukla/auth-hero/prisma/schema.prisma prisma/schema.prisma
```

### Step 3: Create your `.env` file

```bash
cp node_modules/@nandalalshukla/auth-hero/.env.example .env
```

### Step 4: Generate secrets

Each secret should be a 64-character hex string. Run this command once for each secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Fill in `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `MFA_ENCRYPTION_KEY`, and `MFA_TEMP_TOKEN_SECRET` in your `.env`.

### Step 5: Run migrations

```bash
npx prisma migrate dev --name init
```

### Step 6: Create your entry file

```ts
// src/index.ts
import "dotenv/config";
import { createAuthHero } from "@nandalalshukla/auth-hero";

async function main() {
  const auth = await createAuthHero();

  auth.app.listen(3000, () => {
    console.log("🔐 AuthHero running on http://localhost:3000");
  });

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    await auth.shutdown();
    process.exit(0);
  });
}

main();
```

### Step 7: Run

```bash
npx tsx src/index.ts
```

---

## Option 3: Clone the Repository

For full source code access and customization.

```bash
git clone https://github.com/nandalalshukla/authhero.git my-auth-server
cd my-auth-server
npm install
cp .env.example .env
```

Fill in your `.env` values, then:

```bash
npx prisma migrate dev --name init
npm run dev        # Start the server (with hot reload via bun --watch)
npm run worker     # Start the email worker (separate terminal)
```

---

## Database Setup

AuthHero uses PostgreSQL. You need a running PostgreSQL instance.

### Local PostgreSQL

```bash
# macOS (Homebrew)
brew install postgresql@16
brew services start postgresql@16

# Ubuntu/Debian
sudo apt install postgresql
sudo systemctl start postgresql

# Windows (download installer from postgresql.org)
# Or use Docker:
docker run -d --name postgres -e POSTGRES_PASSWORD=password -p 5432:5432 postgres:16
```

### Create the database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create the database
CREATE DATABASE authhero;

# Exit
\q
```

### Set the connection string

In your `.env` file:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/authhero
```

**Format:** `postgresql://USER:PASSWORD@HOST:PORT/DATABASE`

### Run migrations

```bash
npx prisma migrate dev --name init
```

This creates all the required tables: `User`, `Session`, `EmailVerification`, `PasswordReset`, `OAuthAccount`, `MFASecret`.

### Verify with Prisma Studio

```bash
npx prisma studio
```

Opens a visual database browser at `http://localhost:5555`.

---

## Redis Setup

AuthHero uses Redis for rate limiting, job queues (BullMQ), and OAuth one-time codes.

### Local Redis

```bash
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt install redis-server
sudo systemctl start redis

# Windows (use WSL or Docker)
docker run -d --name redis -p 6379:6379 redis:7
```

### Verify Redis is running

```bash
redis-cli ping
# Should return: PONG
```

### Configuration

In your `.env`:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

## Email Configuration

AuthHero sends transactional emails for:

- **Email verification** — After registration
- **Password reset** — When user requests a password reset
- **Resend verification** — When unverified user tries to login

### Gmail (easiest for development)

1. Go to [Google App Passwords](https://myaccount.google.com/apppasswords)
2. Generate an app password for "Mail"
3. Set in your `.env`:

```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-16-char-app-password
```

> **Note:** You need 2FA enabled on your Google account to create app passwords.

### Other SMTP providers

```env
# SendGrid
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=465
EMAIL_USER=apikey
EMAIL_PASS=your-sendgrid-api-key

# Mailgun
EMAIL_HOST=smtp.mailgun.org
EMAIL_PORT=465
EMAIL_USER=postmaster@your-domain.mailgun.org
EMAIL_PASS=your-mailgun-password

# Amazon SES
EMAIL_HOST=email-smtp.us-east-1.amazonaws.com
EMAIL_PORT=465
EMAIL_USER=your-ses-smtp-username
EMAIL_PASS=your-ses-smtp-password
```

### Start the email worker

Emails are processed asynchronously via BullMQ. You need to run the worker in a separate terminal:

```bash
npm run worker
# or: bun --watch src/workers/email.worker.ts
```

**Why a separate worker?** This prevents email sending from blocking HTTP responses. If the SMTP server is slow, your API responses remain fast. It also enables retry logic for failed emails.

---

## Running the Server

### Development mode

```bash
# Terminal 1: Start the server (hot reload with bun)
npm run dev

# Terminal 2: Start the email worker
npm run worker
```

### Production mode

```bash
# Build the TypeScript
npm run build

# Start the compiled server
npm start
# or: node dist/server.js
```

### Available scripts

| Script          | Command                                   | Description                                   |
| --------------- | ----------------------------------------- | --------------------------------------------- |
| `dev`           | `bun --watch src/server.ts`               | Development server with hot reload            |
| `worker`        | `bun --watch src/workers/email.worker.ts` | Email worker with hot reload                  |
| `build`         | `tsup`                                    | Build for production (ESM + DTS + sourcemaps) |
| `start`         | `node dist/server.js`                     | Run production build                          |
| `db:migrate`    | `npx prisma migrate dev`                  | Run database migrations                       |
| `db:generate`   | `npx prisma generate`                     | Regenerate Prisma client                      |
| `db:studio`     | `npx prisma studio`                       | Open Prisma visual browser                    |
| `test`          | `vitest run`                              | Run all tests                                 |
| `test:watch`    | `vitest`                                  | Run tests in watch mode                       |
| `test:coverage` | `vitest run --coverage`                   | Run tests with coverage report                |
| `typecheck`     | `tsc --noEmit`                            | Check types without emitting                  |
| `lint`          | `eslint src/`                             | Lint source code                              |
| `lint:fix`      | `eslint src/ --fix`                       | Auto-fix lint issues                          |
| `format`        | `prettier --write "src/**/*.ts"`          | Format code                                   |
| `format:check`  | `prettier --check "src/**/*.ts"`          | Check formatting                              |

---

## Verify It Works

### Health check

```bash
curl http://localhost:5000/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2026-02-27T12:00:00.000Z"
}
```

### Register a user

```bash
curl -X POST http://localhost:5000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullname": "John Doe",
    "email": "john@example.com",
    "password": "MySecure@Pass1"
  }'
```

Expected response:

```json
{
  "success": true,
  "message": "Registration successful. Please verify your email.",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "fullname": "John Doe",
    "email": "john@example.com",
    "emailVerified": false,
    "mfaEnabled": false,
    "createdAt": "2026-02-27T12:00:00.000Z"
  }
}
```

### Login

```bash
curl -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "john@example.com",
    "password": "MySecure@Pass1"
  }'
```

> **Note:** If email verification is required, you'll get a `403` with `errorCode: "EMAIL_NOT_VERIFIED"` until you verify the email.

---

## Your First API Requests

Here's a complete flow from registration to authenticated request:

### 1. Register

```bash
curl -X POST http://localhost:5000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullname": "Jane Doe",
    "email": "jane@example.com",
    "password": "Strong@Pass123"
  }'
```

### 2. Verify email

Check the email worker terminal — you'll see the verification URL. Extract the token and:

```bash
curl -X POST http://localhost:5000/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{ "token": "YOUR_TOKEN_FROM_EMAIL" }'
```

### 3. Login

```bash
curl -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "jane@example.com",
    "password": "Strong@Pass123"
  }'
```

Response contains `accessToken`. The `refreshToken` is set as an HTTP-only cookie.

### 4. Access a protected route

```bash
curl http://localhost:5000/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 5. Refresh tokens

```bash
curl -X POST http://localhost:5000/auth/refresh-token \
  -b cookies.txt \
  -c cookies.txt
```

### 6. Logout

```bash
curl -X POST http://localhost:5000/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -b cookies.txt
```

---

## Next Steps

- [Configuration](./configuration.md) — Full environment variable reference
- [API Reference](./api-reference.md) — Every endpoint with request/response examples
- [OAuth Setup](./oauth-setup.md) — Configure Google, GitHub, Facebook
- [MFA Guide](./mfa-guide.md) — Enable TOTP multi-factor authentication
- [Architecture](./architecture.md) — Understand the project structure
- [Security](./security.md) — Learn about every security measure
