import jwt from "jsonwebtoken";
import { env } from "./env";
import crypto from "crypto";
import { AppError } from "../lib/AppError";
import { UNAUTHORIZED } from "./http";

export function generateAccessToken(userId: string, sessionId: string) {
  return jwt.sign({ userId, sessionId }, env.ACCESS_TOKEN_SECRET!, {
    expiresIn: "20m",
  });
}

export function verifyAccessToken(token: string) {
  try {
    return jwt.verify(token, env.ACCESS_TOKEN_SECRET!);
  } catch (error) {
    throw new Error("Invalid or expired access token");
  }
}

//to create a funcn that is reusabe to generate random tokens for refresh, email verification, forgot password etc
export function generateRandomToken(length: number) {
  return crypto.randomBytes(length).toString("hex");
}

export function hashRandomToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
export function generateEmailVerifyToken(userId: string) {
  return jwt.sign({ userId }, env.VERIFY_EMAIL_TOKEN_SECRET!, {
    expiresIn: "30m",
  });
}

export function generateForgetPswdToken(userId: string) {
  return jwt.sign({ userId }, env.FORGOT_PSWD_TOKEN_SECRET!, {
    expiresIn: "30m",
  });
}

export function generateChangePswdToken(userId: string) {
  return jwt.sign({ userId }, env.RESET_PSWD_TOKEN_SECRET!, {
    expiresIn: "35m",
  });
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
    env.MFA_TEMP_TOKEN_SECRET!,
    { expiresIn: "5m" },
  );
}

export function verifyMFATempToken(token: string): MFATempTokenPayload {
  try {
    const payload = jwt.verify(token, env.MFA_TEMP_TOKEN_SECRET!) as MFATempTokenPayload;
    if (payload.purpose !== "mfa_challenge") {
      throw new Error("Invalid token purpose");
    }
    return payload;
  } catch {
    throw new AppError(UNAUTHORIZED, "Invalid or expired MFA token");
  }
}
