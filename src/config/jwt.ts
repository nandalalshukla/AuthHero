import jwt from "jsonwebtoken";
import { env } from "./env";
import crypto from "crypto";

export function generateAccessToken(userId: string, sessionId: string) {
  return jwt.sign({ userId, sessionId }, env.ACCESS_TOKEN_SECRET!, {
    expiresIn: "20m",
  });
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
