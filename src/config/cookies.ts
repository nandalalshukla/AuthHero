import type { CookieOptions } from "express";
import { env } from "./env";
import { TOKEN_EXPIRY } from "./constants";

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

const isProduction = env.NODE_ENV === "production";

export const accessTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax", // "strict" breaks OAuth redirects
  maxAge: TOKEN_EXPIRY.ACCESS_TOKEN_MS,
  path: "/",
};

export const refreshTokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  maxAge: TOKEN_EXPIRY.REFRESH_TOKEN_MS,
  path: "/",
};
