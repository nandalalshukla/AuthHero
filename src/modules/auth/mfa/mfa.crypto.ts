import * as OTPAuth from "otplib";
import argon2 from "argon2";
import crypto from "crypto";
import QRCode from "qrcode";
import { env } from "../../../config/env";

const { authenticator } = OTPAuth;

// Allow a 1-step time window tolerance for clock drift between
// the user's authenticator app and the server
authenticator.options = {
  window: 1,
};

// ── AES-256-GCM encryption for TOTP secrets ─────────────────────────────
// TOTP secrets must be encrypted at rest. If the database is breached,
// plaintext secrets would let attackers generate valid TOTP codes.
// We use AES-256-GCM which provides both confidentiality and integrity.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

function getEncryptionKey(): Buffer {
  const key = env.MFA_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error(
      "MFA_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  return Buffer.from(key, "hex");
}

/**
 * Encrypts a TOTP secret using AES-256-GCM.
 * Returns a string in the format: iv:authTag:ciphertext (all hex-encoded).
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts a TOTP secret previously encrypted with encryptSecret().
 */
export function decryptSecret(encryptedStr: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, ciphertext] = encryptedStr.split(":");

  if (!ivHex || !authTagHex || !ciphertext) {
    throw new Error("Invalid encrypted secret format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// ── TOTP helpers ─────────────────────────────────────────────────────────

export const generateTOTPSecret = () => {
  return authenticator.generateSecret();
};

export const generateOTPAuthURL = (email: string, secret: string) => {
  return authenticator.keyuri(email, "AuthHero", secret);
};

export const generateQRCode = async (otpauth: string) => {
  return QRCode.toDataURL(otpauth);
};

/**
 * Verifies a TOTP token against an encrypted secret.
 * Decrypts the secret first, then performs TOTP verification.
 */
export const verifyTOTP = (token: string, encryptedSecret: string) => {
  const secret = decryptSecret(encryptedSecret);
  return authenticator.verify({ token, secret });
};

// ── Backup codes ─────────────────────────────────────────────────────────

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
