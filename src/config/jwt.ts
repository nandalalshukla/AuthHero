import jwt from "jsonwebtoken";
import { env } from "./env";
import crypto from "crypto";
import { AppError } from "../lib/AppError";
import { UNAUTHORIZED } from "./http";
import { TOKEN_EXPIRY } from "./constants";
import type { AccessTokenPayload } from "../modules/auth/auth.types";

export function generateAccessToken(userId: string, sessionId: string) {
  return jwt.sign({ userId, sessionId }, env.ACCESS_TOKEN_SECRET, {
    expiresIn: TOKEN_EXPIRY.ACCESS_TOKEN,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const payload = jwt.verify(token, env.ACCESS_TOKEN_SECRET);

    // Runtime validation of the payload shape
    if (
      typeof payload === "object" &&
      payload !== null &&
      "userId" in payload &&
      "sessionId" in payload &&
      typeof payload.userId === "string" &&
      typeof payload.sessionId === "string"
    ) {
      return { userId: payload.userId, sessionId: payload.sessionId };
    }

    throw new Error("Malformed access token payload");
  } catch {
    throw new AppError(UNAUTHORIZED, "Invalid or expired access token");
  }
}

/** Generates a cryptographically random token (hex-encoded) for refresh tokens, email verification, etc. */
export function generateRandomToken(length: number) {
  return crypto.randomBytes(length).toString("hex");
}

export function hashRandomToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ── MFA Temp Token ──────────────────────────────────────────────────────
// Short-lived token issued after credentials pass but before MFA.
// Contains only the userId — not a full session grant.

export interface MFATempTokenPayload {
  userId: string;
  purpose: "mfa_challenge";
}

export function generateMFATempToken(userId: string): string {
  return jwt.sign(
    { userId, purpose: "mfa_challenge" } satisfies MFATempTokenPayload,
    env.MFA_TEMP_TOKEN_SECRET,
    { expiresIn: TOKEN_EXPIRY.MFA_TEMP_TOKEN },
  );
}

export function verifyMFATempToken(token: string): MFATempTokenPayload {
  try {
    const payload = jwt.verify(token, env.MFA_TEMP_TOKEN_SECRET) as MFATempTokenPayload;
    if (payload.purpose !== "mfa_challenge") {
      throw new Error("Invalid token purpose");
    }
    return payload;
  } catch {
    throw new AppError(UNAUTHORIZED, "Invalid or expired MFA token");
  }
}
