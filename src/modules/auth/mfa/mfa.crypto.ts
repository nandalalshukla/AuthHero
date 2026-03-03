import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from "otplib";
import argon2 from "argon2";
import crypto from "crypto";
import QRCode from "qrcode";
import { env } from "../../../config/env";
import { MFA } from "../../../config/constants";

// Initialise a TOTP instance with the v13 plugin-based architecture.
// NobleCryptoPlugin uses @noble/hashes for HMAC-SHA1 and
// ScureBase32Plugin handles Base32 encoding/decoding.
// A 1-step window tolerates minor clock drift between the
// user's authenticator app and the server.
const totp = new TOTP({
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
});

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

export const generateTOTPSecret = (): string => {
  return totp.generateSecret();
};

export const generateOTPAuthURL = (email: string, secret: string): string => {
  return totp.toURI({ secret, issuer: "AuthHero", label: email });
};

export const generateQRCode = async (otpauth: string) => {
  return QRCode.toDataURL(otpauth);
};

/**
 * Verifies a TOTP token against an encrypted secret.
 * Decrypts the secret first, then performs async TOTP verification.
 * Returns false (instead of throwing) for non-6-digit inputs so
 * callers can fall back to backup code verification.
 */
export const verifyTOTP = async (
  token: string,
  encryptedSecret: string,
): Promise<boolean> => {
  try {
    const secret = decryptSecret(encryptedSecret);
    const result = await totp.verify(token, { secret });
    return result.valid;
  } catch {
    // otplib throws TokenLengthError for non-6-digit tokens (e.g. backup codes).
    // Return false so the caller can try backup code verification instead.
    return false;
  }
};

// ── Backup codes ─────────────────────────────────────────────────────────

export const generateBackupCodes = () => {
  return Array.from({ length: MFA.BACKUP_CODE_COUNT }, () =>
    crypto.randomBytes(4).toString("hex"),
  );
};

//Use argon2 to hash backup codes before storing them in the database.
export const hashBackupCode = async (code: string) => {
  return argon2.hash(code);
};

export const verifyBackupCode = async (code: string, hash: string) => {
  return argon2.verify(hash, code);
};
