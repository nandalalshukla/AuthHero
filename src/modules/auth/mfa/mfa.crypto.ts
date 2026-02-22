import * as OTPAuth from "otplib";
import argon2 from "argon2";
import crypto from "crypto";
import QRCode from "qrcode";

const { authenticator } = OTPAuth;

// Allow a 1-step time window tolerance for clock drift between
// the user's authenticator app and the server
authenticator.options = {
  window: 1,
};

export const generateTOTPSecret = () => {
  return authenticator.generateSecret();
};

export const generateOTPAuthURL = (email: string, secret: string) => {
  return authenticator.keyuri(email, "AuthHero", secret);
};

export const generateQRCode = async (otpauth: string) => {
  return QRCode.toDataURL(otpauth);
};

export const verifyTOTP = (token: string, secret: string) => {
  return authenticator.verify({ token, secret });
};

export const generateBackupCodes = () => {
  return Array.from({ length: 8 }, () => crypto.randomBytes(4).toString("hex"));
};

// Use argon2 consistently (same as password hashing) instead of bcrypt
export const hashBackupCode = async (code: string) => {
  return argon2.hash(code);
};

export const verifyBackupCode = async (code: string, hash: string) => {
  return argon2.verify(hash, code);
};
