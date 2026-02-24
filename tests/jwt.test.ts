import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock env before importing jwt module
vi.mock("../src/config/env", () => ({
  env: {
    ACCESS_TOKEN_SECRET: "test-access-secret-key-minimum-10",
    REFRESH_TOKEN_SECRET: "test-refresh-secret-key-minimum-10",
    VERIFY_EMAIL_TOKEN_SECRET: "test-verify-email-secret-min10",
    FORGOT_PSWD_TOKEN_SECRET: "test-forgot-pwd-secret-min10aa",
    RESET_PSWD_TOKEN_SECRET: "test-reset-pwd-secret-min10aaa",
    MFA_TEMP_TOKEN_SECRET: "test-mfa-temp-secret-min10aaaa",
  },
}));

import {
  generateAccessToken,
  verifyAccessToken,
  generateRandomToken,
  hashRandomToken,
  generateEmailVerifyToken,
  generateForgetPswdToken,
  generateChangePswdToken,
  generateMFATempToken,
  verifyMFATempToken,
} from "../src/config/jwt";

describe("JWT utilities", () => {
  describe("generateAccessToken / verifyAccessToken", () => {
    it("should generate and verify a valid access token", () => {
      const token = generateAccessToken("user-123", "session-456");
      const payload = verifyAccessToken(token) as any;

      expect(payload.userId).toBe("user-123");
      expect(payload.sessionId).toBe("session-456");
    });

    it("should throw on invalid token", () => {
      expect(() => verifyAccessToken("invalid-token")).toThrow(
        "Invalid or expired access token",
      );
    });

    it("should throw on tampered token", () => {
      const token = generateAccessToken("user-1", "sess-1");
      const tampered = token.slice(0, -5) + "XXXXX";
      expect(() => verifyAccessToken(tampered)).toThrow();
    });
  });

  describe("generateRandomToken / hashRandomToken", () => {
    it("should generate a hex string of specified byte length", () => {
      const token = generateRandomToken(32);
      // 32 bytes = 64 hex chars
      expect(token).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(token)).toBe(true);
    });

    it("should generate unique tokens each time", () => {
      const t1 = generateRandomToken(32);
      const t2 = generateRandomToken(32);
      expect(t1).not.toBe(t2);
    });

    it("should produce consistent SHA-256 hash for same input", () => {
      const token = generateRandomToken(32);
      const hash1 = hashRandomToken(token);
      const hash2 = hashRandomToken(token);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 = 64 hex chars
    });

    it("should produce different hashes for different inputs", () => {
      const hash1 = hashRandomToken("token-a");
      const hash2 = hashRandomToken("token-b");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("purpose-specific token generators", () => {
    it("should generate an email verification token", () => {
      const token = generateEmailVerifyToken("user-1");
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3); // JWT format
    });

    it("should generate a forgot password token", () => {
      const token = generateForgetPswdToken("user-1");
      expect(token.split(".")).toHaveLength(3);
    });

    it("should generate a change password token", () => {
      const token = generateChangePswdToken("user-1");
      expect(token.split(".")).toHaveLength(3);
    });
  });

  describe("MFA temp token", () => {
    it("should generate and verify an MFA temp token", () => {
      const token = generateMFATempToken("user-mfa-1");
      const payload = verifyMFATempToken(token);

      expect(payload.userId).toBe("user-mfa-1");
      expect(payload.purpose).toBe("mfa_challenge");
    });

    it("should throw AppError on invalid MFA temp token", () => {
      expect(() => verifyMFATempToken("invalid")).toThrow("Invalid or expired MFA token");
    });
  });
});
