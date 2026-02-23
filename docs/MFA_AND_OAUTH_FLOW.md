# MFA & OAuth — Complete Flow Documentation

> **AuthHero** authentication system  
> Last reviewed: February 23, 2026

---

## Table of Contents

1. [OAuth Flow](#1-oauth-flow)
   - [Architecture Overview](#11-architecture-overview)
   - [Step-by-Step: Getting the Auth URL](#12-step-by-step-getting-the-auth-url)
   - [Step-by-Step: Handling the Callback](#13-step-by-step-handling-the-callback)
   - [Provider Strategy Pattern](#14-provider-strategy-pattern)
   - [Account Linking Logic](#15-account-linking-logic-oauthservicehandlecallback)
   - [Supported Providers](#16-supported-providers)
2. [MFA Flow](#2-mfa-flow)
   - [Architecture Overview](#21-architecture-overview)
   - [Step-by-Step: Setting Up MFA](#22-step-by-step-setting-up-mfa)
   - [Step-by-Step: Verifying & Enabling MFA](#23-step-by-step-verifying--enabling-mfa)
   - [Step-by-Step: MFA Challenge During Login](#24-step-by-step-mfa-challenge-during-login)
   - [Backup Codes](#25-backup-codes)
   - [Crypto Details](#26-crypto-details)
3. [How OAuth and MFA Interact](#3-how-oauth-and-mfa-interact)
4. [Completeness Status & Known Gaps](#4-completeness-status--known-gaps)
5. [Database Models](#5-database-models)
6. [API Endpoints Summary](#6-api-endpoints-summary)

---

## 1. OAuth Flow

### 1.1 Architecture Overview

OAuth uses the **Authorization Code** flow (the most secure browser-based OAuth flow). The system supports three providers: **Google**, **GitHub**, and **Facebook**.

The codebase uses the **Strategy Pattern** — each provider implements a common `OAuthProvider` interface so the service layer doesn't know or care which provider is being used.

```
Frontend                    AuthHero Server                 OAuth Provider (Google/GitHub/Facebook)
   │                              │                                    │
   │  GET /auth/oauth/:provider   │                                    │
   │─────────────────────────────>│                                    │
   │  { url: "https://..." }      │                                    │
   │<─────────────────────────────│                                    │
   │                              │                                    │
   │  User redirects to provider  │                                    │
   │──────────────────────────────────────────────────────────────────>│
   │                              │                                    │
   │                              │  GET /auth/oauth/callback/:provider│
   │                              │  ?code=ABC&state=XYZ              │
   │                              │<───────────────────────────────────│
   │                              │                                    │
   │                              │  Exchange code for access token    │
   │                              │───────────────────────────────────>│
   │                              │  { access_token }                  │
   │                              │<───────────────────────────────────│
   │                              │                                    │
   │                              │  Fetch user profile                │
   │                              │───────────────────────────────────>│
   │                              │  { id, email }                     │
   │                              │<───────────────────────────────────│
   │                              │                                    │
   │  Redirect to frontend        │                                    │
   │  with accessToken             │                                    │
   │<─────────────────────────────│                                    │
```

### 1.2 Step-by-Step: Getting the Auth URL

**Endpoint:** `GET /auth/oauth/:provider`  
**File:** `oauth.controller.ts → OAuthController.getAuthUrl`

1. **Extract provider** from the URL parameter (e.g., `google`, `github`, `facebook`).
2. **Generate a CSRF state token** — a 32-byte random hex string using `crypto.randomBytes(32)`.
3. **Store the state in a cookie** — `{provider}_auth_state` cookie, set as:
   - `httpOnly: true` (JavaScript can't read it)
   - `secure: true` (only sent over HTTPS)
   - `sameSite: "lax"` (prevents cross-site sending)
   - `maxAge: 10 minutes` (short-lived)
4. **Build the authorization URL** for the provider, including:
   - `client_id` — your app's ID registered with the provider
   - `redirect_uri` — the callback URL the provider will send the user back to
   - `scope` — what data you're requesting (email, profile)
   - `state` — the CSRF token from step 2
   - `response_type=code` — tells the provider to return an authorization code
5. **Return the URL** to the frontend as JSON: `{ success: true, data: { url } }`.
6. The **frontend redirects the user** to this URL (e.g., opens Google's consent screen).

### 1.3 Step-by-Step: Handling the Callback

**Endpoint:** `GET /auth/oauth/callback/:provider`  
**File:** `oauth.controller.ts → OAuthController.handleCallback`

After the user grants permission, the provider redirects them back to your server with `?code=...&state=...`.

1. **CSRF Validation:**
   - Read the `{provider}_auth_state` cookie (set in step 1.2).
   - Compare it with the `state` query parameter from the provider.
   - If they don't match → reject with `403 "Invalid state parameter. Possible CSRF attack."`.
   - This prevents attackers from tricking users into linking the attacker's account.

2. **Check for authorization code** — if `code` is missing, return `400`.

3. **Exchange code for user profile** — calls `OAuthService.handleCallback(provider, code)`:
   - Selects the correct provider strategy (Google/GitHub/Facebook).
   - The provider exchanges the code for an access token with the third-party API.
   - Uses the access token to fetch the user's profile (id + email).
   - Returns a standardized `OAuthUserProfile` object.

4. **Sync with database** (account linking — see section 1.5).

5. **Create a session** — identical to the normal login flow:
   - Generate a 40-byte random refresh token.
   - Hash it with SHA-256 (only the hash is stored in DB).
   - Create a `Session` record with `userId`, `refreshTokenHash`, `expiresAt` (30 days), `userAgent`, `ipAddress`.
   - Generate a JWT access token containing `{ userId, sessionId }`.

6. **Set cookies & redirect:**
   - Clear the `{provider}_auth_state` cookie (no longer needed).
   - Set the `refreshToken` cookie (httpOnly, secure).
   - Redirect the user to `{FRONTEND_URL}/auth/callback?accessToken={accessToken}`.

### 1.4 Provider Strategy Pattern

All providers implement the `OAuthProvider` interface:

```typescript
interface OAuthProvider {
  getProfile(code: string): Promise<OAuthUserProfile>;
}
```

This means the service only calls `strategy.getProfile(code)` and gets back a uniform object:

```typescript
{
  providerUserId: string; // e.g., Google's unique user ID
  email: string; // user's email
  provider: string; // "google" | "github" | "facebook"
}
```

Each provider internally handles its own token exchange URL, API endpoints, and quirks.

### 1.5 Account Linking Logic (`OAuthService.handleCallback`)

All DB operations happen inside a **Prisma transaction** for data integrity.

```
Code received from provider
         │
         ▼
  Fetch profile from provider API
         │
         ▼
  Does an OAuthAccount with this
  (provider + providerUserId) exist?
        │
   ┌────┴────┐
   YES       NO
   │         │
   │         ▼
   │    Does a User with this email exist?
   │         │
   │    ┌────┴────┐
   │    YES       NO
   │    │         │
   │    │         ▼
   │    │    CREATE new User
   │    │    (emailVerified: true,
   │    │     passwordHash: "")
   │    │    + CREATE OAuthAccount
   │    │         │
   │    ▼         │
   │    LINK: CREATE OAuthAccount     │
   │    for existing User             │
   │    │         │
   ▼    ▼         ▼
   Return the User object
```

**Three scenarios:**

| Scenario                 | What happens                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| **Returning OAuth user** | `OAuthAccount` found → return associated `User`                                                  |
| **Existing email user**  | No `OAuthAccount` but `User` with same email exists → create `OAuthAccount` link → return `User` |
| **Brand new user**       | Neither found → create `User` + `OAuthAccount` together → return new `User`                      |

- Social-only users get `passwordHash: ""` (they have no password, only social login).
- Social users are auto-verified (`emailVerified: true`) since the provider already verified their email.

### 1.6 Supported Providers

#### Google

- **Token endpoint:** `https://oauth2.googleapis.com/token`
- **Profile endpoint:** `https://www.googleapis.com/oauth2/v2/userinfo`
- Sends `grant_type: "authorization_code"` in the token request.
- Scopes: `email + profile`

#### GitHub

- **Token endpoint:** `https://github.com/login/oauth/access_token`
- **Profile endpoint:** `https://api.github.com/user`
- **Emails endpoint:** `https://api.github.com/user/emails` (separate call required)
- GitHub may have the primary email set to private, so a second API call fetches emails and picks the `primary + verified` one.
- Scope: `user:email`

#### Facebook

- **Token endpoint:** `https://graph.facebook.com/v12.0/oauth/access_token` (uses GET with query params)
- **Profile endpoint:** `https://graph.facebook.com/me?fields=id,email`
- Facebook requires explicitly requesting the `email` field.
- Throws an error if the Facebook account has no email (some accounts don't).
- Scope: `email`

---

## 2. MFA Flow

### 2.1 Architecture Overview

MFA uses **TOTP (Time-based One-Time Password)** — the same standard used by Google Authenticator, Authy, 1Password, etc. It also provides **backup codes** as a fallback.

The flow has three phases:

```
Phase 1: SETUP (authenticated user initiates MFA)
  User ──POST /auth/mfa/setup──> Server generates TOTP secret + QR code
  User scans QR code in authenticator app

Phase 2: VERIFY (user proves they set up the app correctly)
  User ──POST /auth/mfa/verify──> Server checks the 6-digit code
  If correct → MFA is permanently enabled

Phase 3: CHALLENGE (during every future login)
  User logs in with email/password
  Server sees mfaEnabled: true → requires TOTP code
  User ──POST /auth/mfa/challenge──> Server verifies code → issues session
```

### 2.2 Step-by-Step: Setting Up MFA

**Endpoint:** `POST /auth/mfa/setup`  
**Auth required:** Yes (Bearer token)  
**File:** `mfa.controller.ts → initiateMFA` → `mfa.service.ts → MFAService.initiate`

1. **Authenticate the user** via the `authenticate` middleware (verifies JWT, checks session in DB).
2. **Extract `userId`** from the verified access token.
3. **Fetch the user's email** from the database (needed for the TOTP URI label).
4. **Generate a TOTP secret** — `authenticator.generateSecret()` from `otplib`. This is a Base32-encoded random key.
5. **Build the OTP Auth URL** — `otpauth://totp/AuthHero:{email}?secret={secret}&issuer=AuthHero`
   - This URI is what authenticator apps understand.
6. **Generate a QR code** — converts the OTP Auth URL into a Data URL image (base64 PNG) using the `qrcode` library.
7. **Generate 8 backup codes** — each is 4 random bytes encoded as hex (8 characters each).
8. **Hash all backup codes** with **Argon2** (same algorithm used for passwords) — only hashes are stored.
9. **Upsert the `MFASecret` record** in the database:
   - Stores the TOTP `secret` (in the `secretHash` field), hashed backup codes, and `verified: false`.
   - Uses `upsert` so re-initiating setup replaces the old secret.
10. **Return to the user:**
    - `qrCode` — the Data URL image they scan with their authenticator app.
    - `backupCodes` — the 8 plaintext codes (shown **only once**, user must save them).

### 2.3 Step-by-Step: Verifying & Enabling MFA

**Endpoint:** `POST /auth/mfa/verify`  
**Auth required:** Yes  
**Body:** `{ "token": "123456" }` (6-digit code from authenticator app)  
**File:** `mfa.controller.ts → verifyMFA` → `mfa.service.ts → MFAService.verifyAndEnable`

1. **Authenticate the user** (same as setup).
2. **Fetch the `MFASecret` record** for this user.
3. **Verify the TOTP code** — `authenticator.verify({ token, secret })`:
   - Uses the TOTP algorithm: takes the current Unix timestamp, divides by 30 seconds, HMAC-SHA1 with the secret, and extracts a 6-digit code.
   - Allows a **±1 step window** (so codes from 30 seconds ago or 30 seconds in the future are accepted) to handle clock drift.
4. **If valid:**
   - Update `MFASecret` → `verified: true`, `enabledAt: now()`.
   - Update `User` → `mfaEnabled: true`.
5. **If invalid:** throw `400 "Invalid MFA token"`.

After this step, MFA is **permanently enabled** for the user's account.

### 2.4 Step-by-Step: MFA Challenge During Login

**Endpoint:** `POST /auth/mfa/challenge`  
**Auth required:** No (user is mid-login, not yet fully authenticated)  
**Body:** `{ "tempToken": "...", "code": "123456" }`  
**File:** `mfa.controller.ts → challengeMFA` → `mfa.service.ts → MFAService.verifyChallenge`

> ⚠️ **Note:** This endpoint currently has implementation gaps — see [Section 4](#4-completeness-status--known-gaps).

**Intended flow:**

1. User submits email + password to `POST /auth/login`.
2. Login service validates credentials and sees `user.mfaEnabled === true`.
3. Instead of issuing a full session, the server returns a **temporary token** (short-lived, contains userId).
4. Frontend prompts the user for their 6-digit TOTP code.
5. Frontend sends `{ tempToken, code }` to `POST /auth/mfa/challenge`.
6. Server validates the temp token to extract `userId`.
7. **Verify the code** against the stored TOTP secret:
   - First tries TOTP verification (`authenticator.verify`).
   - If that fails, iterates through stored backup code hashes and checks each with `argon2.verify`.
8. **If valid:** create a full session (access token + refresh token) and return it.
9. **If backup code used:** remove that code's hash from the `backupCodes` array (one-time use).
10. **If invalid:** throw `400 "Invalid MFA code"`.

### 2.5 Backup Codes

Backup codes are a safety net for when the user loses access to their authenticator app.

| Property         | Detail                                                             |
| ---------------- | ------------------------------------------------------------------ |
| **Count**        | 8 codes generated during setup                                     |
| **Format**       | 8-character hex strings (e.g., `a1f3b2c9`)                         |
| **Storage**      | Each code is individually hashed with Argon2                       |
| **One-time use** | Once a backup code is used, its hash is removed from the array     |
| **Shown once**   | Plaintext codes are only returned during the `/mfa/setup` response |

**Verification flow:**

```
User submits code
       │
       ▼
  Is it a valid TOTP code? ──YES──> ✅ Pass
       │
       NO
       │
       ▼
  Loop through stored backup code hashes:
    argon2.verify(code, hash) ?
       │
   ┌───┴───┐
   YES     NO (all tried)
   │       │
   ▼       ▼
  ✅ Pass   ❌ Reject
  + remove    "Invalid MFA code"
  used hash
```

### 2.6 Crypto Details

| Function               | Algorithm                        | Library                                   |
| ---------------------- | -------------------------------- | ----------------------------------------- |
| TOTP secret generation | Base32 random key                | `otplib` (`authenticator.generateSecret`) |
| TOTP verification      | HMAC-SHA1 + time-step (RFC 6238) | `otplib` (`authenticator.verify`)         |
| QR code generation     | PNG → Base64 Data URL            | `qrcode`                                  |
| Backup code generation | `crypto.randomBytes(4)` → hex    | Node.js `crypto`                          |
| Backup code hashing    | Argon2id                         | `argon2`                                  |
| Time window tolerance  | ±1 step (±30 seconds)            | `otplib` (`window: 1`)                    |

---

## 3. How OAuth and MFA Interact

OAuth and MFA are fully integrated:

- **OAuth login** checks `user.mfaEnabled` after the callback. If MFA is enabled, instead of creating a session, it redirects the user to `{FRONTEND_URL}/auth/mfa-challenge?tempToken=...` so the frontend can prompt for the TOTP code.
- **MFA challenge** (`POST /auth/mfa/challenge`) accepts the `tempToken` + TOTP code, verifies both, and creates a full session.
- **MFA setup/verify** is only accessible to already-authenticated users (requires Bearer token).
- **MFA disable** requires authentication + a valid TOTP code to prevent accidental or unauthorized disabling.
- **`requireMFA` middleware** can be applied to any sensitive route to enforce that MFA-enabled users have a properly verified setup.

---

## 4. Completeness Status

### ✅ OAuth — Complete

| Feature                                         | Status |
| ----------------------------------------------- | ------ |
| Authorization Code flow                         | ✅     |
| CSRF protection (state parameter in cookie)     | ✅     |
| Google provider                                 | ✅     |
| GitHub provider (with private email handling)   | ✅     |
| Facebook provider (with email validation)       | ✅     |
| Account linking (3 scenarios)                   | ✅     |
| Session creation (refresh token + access token) | ✅     |
| Cookie cleanup + frontend redirect              | ✅     |
| Strategy Pattern architecture                   | ✅     |
| MFA integration (temp token redirect)           | ✅     |

### ✅ MFA — Complete

| Feature                                               | Status |
| ----------------------------------------------------- | ------ |
| TOTP secret generation + QR code                      | ✅     |
| Backup codes (argon2 hashed, one-time use)            | ✅     |
| Setup endpoint (`POST /mfa/setup`)                    | ✅     |
| Verify & enable endpoint (`POST /mfa/verify`)         | ✅     |
| Challenge endpoint (`POST /mfa/challenge`)            | ✅     |
| Login flow MFA check (temp token instead of session)  | ✅     |
| Secure temp token mechanism (signed JWT, 5min expiry) | ✅     |
| OAuth + MFA integration (redirect to MFA challenge)   | ✅     |
| MFA disable endpoint (`POST /mfa/disable`)            | ✅     |
| `requireMFA` middleware for sensitive routes          | ✅     |
| Validation schemas (Zod)                              | ✅     |
| AppErrorCode enum integration                         | ✅     |

---

## 5. Database Models

### OAuthAccount

```
┌──────────────────┐
│   OAuthAccount   │
├──────────────────┤
│ id (UUID)        │
│ userId (FK)      │──→ User
│ provider         │    e.g., "google"
│ providerUserId   │    e.g., "1234567890"
│ createdAt        │
└──────────────────┘
UNIQUE(provider, providerUserId)
```

### MFASecret

```
┌──────────────────┐
│    MFASecret     │
├──────────────────┤
│ id (UUID)        │
│ userId (FK, UQ)  │──→ User (one-to-one)
│ secretHash       │    TOTP secret (Base32)
│ backupCodes[]    │    Argon2 hashed codes
│ verified         │    false until first TOTP check
│ enabledAt        │    timestamp when verified
│ createdAt        │
└──────────────────┘
```

---

## 6. API Endpoints Summary

### OAuth Endpoints

| Method | Path                             | Auth | Description                                                                                           |
| ------ | -------------------------------- | ---- | ----------------------------------------------------------------------------------------------------- |
| `GET`  | `/auth/oauth/:provider`          | No   | Returns the OAuth authorization URL. Frontend redirects user here.                                    |
| `GET`  | `/auth/oauth/callback/:provider` | No   | Callback from provider. Validates CSRF state, exchanges code, creates session, redirects to frontend. |

### MFA Endpoints

| Method | Path                  | Auth | Description                                                                    |
| ------ | --------------------- | ---- | ------------------------------------------------------------------------------ |
| `POST` | `/auth/mfa/setup`     | Yes  | Generates TOTP secret, QR code, and backup codes.                              |
| `POST` | `/auth/mfa/verify`    | Yes  | Verifies the first TOTP code and permanently enables MFA.                      |
| `POST` | `/auth/mfa/challenge` | No   | Verifies TOTP/backup code during login (MFA step). Creates session on success. |
| `POST` | `/auth/mfa/disable`   | Yes  | Disables MFA after verifying current TOTP code.                                |
