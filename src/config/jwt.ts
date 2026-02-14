import jwt from "jsonwebtoken";
import { env } from "./env";

export function generateAccessToken(userId: string, userRole: string) {
  return jwt.sign({ userId, userRole }, env.ACCESS_TOKEN_SECRET!, {
    expiresIn: "2m",
  });
}

export function generateRefreshToken(userId: string) {
  return jwt.sign({ userId }, env.REFRESH_TOKEN_SECRET!, {
    expiresIn: "7d",
  });
}
export function generateEmailVerifyToken(userId: string) {
  return jwt.sign({ userId }, env.VERIFY_EMAIL_TOKEN_SECRET!, {
    expiresIn: "30m",
  });
}

export function generateForgetPswdToken(userId: string) {
  return jwt.sign({ userId }, env.FORGET_PSWD_TOKEN_SECRET!, {
    expiresIn: "30m",
  });
}

export function generateChangePswdToken(userId: string) {
  return jwt.sign({ userId }, env.RESET_PSWD_TOKEN_SECRET!, {
    expiresIn: "35m",
  });
}
