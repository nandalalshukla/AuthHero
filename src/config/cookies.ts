import type { CookieOptions } from "express";

/**
 * Cookie configuration for tokens.
 *
 * Security explanations:
 * - httpOnly: true  → JS cannot access via document.cookie (XSS protection)
 * - secure: true    → Only sent over HTTPS (prevents man-in-the-middle)
 * - sameSite: "lax" → Sent on top-level navigation but not on cross-site
 *                     subrequests. "strict" breaks OAuth redirects.
 *                     "none" is only needed for cross-origin API calls
 *                     and requires secure: true.
 * - path: "/"       → Available on all routes (not just /auth)
 */

const isProduction = process.env.NODE_ENV === "production";

export const accessTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction, // Allow HTTP in development
  sameSite: isProduction ? "strict" : "lax",
  maxAge: 15 * 60 * 1000, // 15 minutes
  path: "/",
};

export const refreshTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "strict" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/",
};
