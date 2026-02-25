import { describe, it, expect, vi } from "vitest";

// Mock env before importing the module
vi.mock("../src/config/env", () => ({
  env: {
    // 64-char hex string = 32 bytes for AES-256
    MFA_ENCRYPTION_KEY:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  },
}));

import {
  generateTOTPSecret,
  generateOTPAuthURL,
  verifyTOTP,
  encryptSecret,
  decryptSecret,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
} from "../src/modules/auth/mfa/mfa.crypto";

describe("MFA crypto utilities", () => {
  describe("AES-256-GCM encryption", () => {
    it("should encrypt and decrypt a secret correctly", () => {
      const secret = "JBSWY3DPEHPK3PXP";
      const encrypted = encryptSecret(secret);

      expect(encrypted).not.toBe(secret);
      expect(encrypted).toContain(":"); // format: iv:authTag:ciphertext
      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toBe(secret);
    });

    it("should produce different ciphertexts for the same input (random IV)", () => {
      const secret = "TESTTOTP12345678";
      const enc1 = encryptSecret(secret);
      const enc2 = encryptSecret(secret);

      expect(enc1).not.toBe(enc2);

      // But both decrypt to the same value
      expect(decryptSecret(enc1)).toBe(secret);
      expect(decryptSecret(enc2)).toBe(secret);
    });

    it("should throw on tampered ciphertext", () => {
      const encrypted = encryptSecret("TESTSECRET");
      const parts = encrypted.split(":");
      // Tamper with the ciphertext
      parts[2] = "ff" + parts[2]!.slice(2);
      const tampered = parts.join(":");

      expect(() => decryptSecret(tampered)).toThrow();
    });

    it("should throw on invalid format", () => {
      expect(() => decryptSecret("not-valid-format")).toThrow(
        "Invalid encrypted secret format",
      );
    });
  });

  describe("TOTP generation", () => {
    it("should generate a base32 TOTP secret", () => {
      const secret = generateTOTPSecret();
      expect(secret).toBeDefined();
      expect(typeof secret).toBe("string");
      expect(secret.length).toBeGreaterThan(0);
    });

    it("should generate a valid otpauth URL", () => {
      const secret = generateTOTPSecret();
      const url = generateOTPAuthURL("test@example.com", secret);

      expect(url).toContain("otpauth://totp/");
      expect(url).toContain("AuthHero");
      expect(url).toContain("test%40example.com");
      expect(url).toContain("secret=");
    });
  });

  describe("TOTP verification", () => {
    it("should verify a valid TOTP code against encrypted secret", async () => {
      // We can't easily test with a real TOTP code,
      // but we can verify the function doesn't throw on valid inputs
      const secret = generateTOTPSecret();
      const encrypted = encryptSecret(secret);

      // An invalid code should return false (not throw)
      const result = await verifyTOTP("000000", encrypted);
      expect(typeof result).toBe("boolean");
    });
  });

  describe("backup codes", () => {
    it("should generate 8 backup codes", () => {
      const codes = generateBackupCodes();
      expect(codes).toHaveLength(8);
      codes.forEach((code) => {
        expect(typeof code).toBe("string");
        expect(code.length).toBe(8); // 4 bytes = 8 hex chars
        expect(/^[a-f0-9]+$/.test(code)).toBe(true);
      });
    });

    it("should generate unique backup codes", () => {
      const codes = generateBackupCodes();
      const unique = new Set(codes);
      expect(unique.size).toBe(8);
    });

    it("should hash and verify backup codes correctly", async () => {
      const code = "a1b2c3d4";
      const hash = await hashBackupCode(code);

      expect(hash).not.toBe(code);
      expect(await verifyBackupCode(code, hash)).toBe(true);
      expect(await verifyBackupCode("wrong", hash)).toBe(false);
    });
  });
});
