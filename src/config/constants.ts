/**
 * Centralized constants for the AuthHero application.
 *
 * All magic numbers, token lengths, and expiry durations are defined here
 * to ensure consistency across the codebase and make tuning easy.
 */

// ── Token Lengths (in bytes, output is hex so string length = 2x) ────────
export const TOKEN_LENGTH = {
  /** Verification & password reset tokens (36 bytes → 72 hex chars) */
  VERIFICATION: 36,
  /** Refresh tokens (40 bytes → 80 hex chars) */
  REFRESH: 40,
  /** OAuth one-time codes (32 bytes → 64 hex chars) */
  OAUTH_CODE: 32,
  /** CSRF state for OAuth (32 bytes → 64 hex chars) */
  OAUTH_STATE: 32,
} as const;

// ── Token Expiry Durations ───────────────────────────────────────────────
export const TOKEN_EXPIRY = {
  /** Access token JWT lifetime */
  ACCESS_TOKEN: "15m",
  /** Access token cookie max-age (must match ACCESS_TOKEN) */
  ACCESS_TOKEN_MS: 15 * 60 * 1000,
  /** Refresh token lifetime in days */
  REFRESH_TOKEN_DAYS: 30,
  /** Refresh token cookie max-age */
  REFRESH_TOKEN_MS: 30 * 24 * 60 * 60 * 1000,
  /** Email verification token lifetime in minutes */
  EMAIL_VERIFICATION_MINUTES: 10,
  /** Password reset token lifetime in minutes */
  PASSWORD_RESET_MINUTES: 15,
  /** MFA temp token (issued after password, before MFA challenge) */
  MFA_TEMP_TOKEN: "5m",
  /** OAuth one-time code TTL in Redis (seconds) */
  OAUTH_CODE_TTL_SECONDS: 120,
  /** OAuth state cookie max-age */
  OAUTH_STATE_MS: 10 * 60 * 1000,
} as const;

// ── MFA ──────────────────────────────────────────────────────────────────
export const MFA = {
  /** Number of backup codes generated during MFA setup */
  BACKUP_CODE_COUNT: 8,
} as const;

// ── App ──────────────────────────────────────────────────────────────────
export const APP = {
  /** Application name used in emails and TOTP issuer */
  NAME: "AuthHero",
} as const;
