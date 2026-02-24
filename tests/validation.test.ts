import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from "../src/modules/auth/auth.validation";

describe("auth validation schemas", () => {
  describe("registerSchema", () => {
    it("should accept valid registration data", () => {
      const result = registerSchema.safeParse({
        email: "Test@Example.com",
        password: "SecureP@ss1",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        // email should be lowercased and trimmed
        expect(result.data.email).toBe("test@example.com");
      }
    });

    it("should reject invalid email", () => {
      const result = registerSchema.safeParse({
        email: "not-an-email",
        password: "SecureP@ss1",
      });
      expect(result.success).toBe(false);
    });

    it("should reject password shorter than 8 chars", () => {
      const result = registerSchema.safeParse({
        email: "a@b.com",
        password: "Ab1@",
      });
      expect(result.success).toBe(false);
    });

    it("should reject password without uppercase", () => {
      const result = registerSchema.safeParse({
        email: "a@b.com",
        password: "securep@ss1",
      });
      expect(result.success).toBe(false);
    });

    it("should reject password without lowercase", () => {
      const result = registerSchema.safeParse({
        email: "a@b.com",
        password: "SECUREP@SS1",
      });
      expect(result.success).toBe(false);
    });

    it("should reject password without digit", () => {
      const result = registerSchema.safeParse({
        email: "a@b.com",
        password: "SecureP@ss",
      });
      expect(result.success).toBe(false);
    });

    it("should reject password without special character", () => {
      const result = registerSchema.safeParse({
        email: "a@b.com",
        password: "SecurePass1",
      });
      expect(result.success).toBe(false);
    });

    it("should reject password longer than 128 characters", () => {
      const result = registerSchema.safeParse({
        email: "a@b.com",
        password: "A@1" + "a".repeat(126),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("loginSchema", () => {
    it("should accept valid login data", () => {
      const result = loginSchema.safeParse({
        email: "Test@Example.com",
        password: "anything",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe("test@example.com");
      }
    });

    it("should reject empty password", () => {
      const result = loginSchema.safeParse({
        email: "a@b.com",
        password: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("verifyEmailSchema", () => {
    it("should accept a non-empty token", () => {
      const result = verifyEmailSchema.safeParse({ token: "abc123" });
      expect(result.success).toBe(true);
    });

    it("should reject empty token", () => {
      const result = verifyEmailSchema.safeParse({ token: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("forgotPasswordSchema", () => {
    it("should accept valid email", () => {
      const result = forgotPasswordSchema.safeParse({
        email: "test@example.com",
      });
      expect(result.success).toBe(true);
    });

    it("should reject invalid email", () => {
      const result = forgotPasswordSchema.safeParse({ email: "bad" });
      expect(result.success).toBe(false);
    });
  });

  describe("resetPasswordSchema", () => {
    it("should accept valid token and strong password", () => {
      const result = resetPasswordSchema.safeParse({
        token: "valid-token",
        newPassword: "NewSecure@1",
      });
      expect(result.success).toBe(true);
    });

    it("should reject weak new password", () => {
      const result = resetPasswordSchema.safeParse({
        token: "valid-token",
        newPassword: "weak",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("changePasswordSchema", () => {
    it("should accept valid current and new password", () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: "anything",
        newPassword: "NewSecure@1",
      });
      expect(result.success).toBe(true);
    });

    it("should reject empty current password", () => {
      const result = changePasswordSchema.safeParse({
        currentPassword: "",
        newPassword: "NewSecure@1",
      });
      expect(result.success).toBe(false);
    });
  });
});
