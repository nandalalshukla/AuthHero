import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── What are security tests? ───────────────────────────────────────────
// Security tests verify that your auth system defends against real attacks:
// - Timing attacks (measuring response times to enumerate users)
// - Token reuse (detecting stolen refresh tokens)
// - Token expiry (ensuring old tokens can't be used)
// - One-time use tokens (preventing replay attacks)
// - OAuth-only account protection (preventing password-based attacks)
// - Email enumeration (not revealing which emails are registered)

// ─── Mock all external dependencies ─────────────────────────────────────

vi.mock("../src/config/env", () => ({
  env: {
    APP_URL: "http://localhost:3000",
    ACCESS_TOKEN_SECRET: "test-access-secret-key-minimum-10",
    REFRESH_TOKEN_SECRET: "test-refresh-secret-key-minimum-10",
    MFA_TEMP_TOKEN_SECRET: "test-mfa-temp-secret-min10aaaa",
  },
}));

vi.mock("../src/config/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    emailVerification: {
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    passwordReset: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../src/utils/hash", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed-password"),
  verifyPassword: vi.fn(),
}));

vi.mock("../src/utils/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/config/jwt", () => ({
  generateAccessToken: vi.fn().mockReturnValue("mock-access-token"),
  generateRandomToken: vi.fn().mockReturnValue("mock-random-token"),
  hashRandomToken: vi.fn().mockReturnValue("mock-hashed-token"),
  generateMFATempToken: vi.fn().mockReturnValue("mock-mfa-temp-token"),
}));

vi.mock("../src/config/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  loginUser,
  verifyEmail,
  refreshSession,
  resetPassword,
  changePassword,
  forgotPassword,
} from "../src/modules/auth/auth.service";

import { prisma } from "../src/config/prisma";
import { verifyPassword } from "../src/utils/hash";
import { sendEmail } from "../src/utils/email";
import { AppError, AppErrorCode } from "../src/lib/AppError";
import { logger } from "../src/config/logger";

const mockPrisma = prisma as any;

// ═══════════════════════════════════════════════════════════════════════
// SECURITY TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── TIMING ATTACK PROTECTION ─────────────────────────────────────────
  // Attack: An attacker sends login requests with different emails.
  // If the server responds faster when the email doesn't exist (because
  // it skips password hashing), the attacker can enumerate valid emails.
  //
  // Defense: loginUser() always runs verifyPassword() — even when the
  // user doesn't exist — using a pre-computed dummy hash. This makes
  // response times indistinguishable.
  describe("timing attack protection", () => {
    it("should call verifyPassword even when user doesn't exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (verifyPassword as any).mockResolvedValue(false);

      await expect(
        loginUser("nonexistent@example.com", "password"),
      ).rejects.toThrow("Invalid credentials");

      // CRITICAL: verifyPassword must have been called even though
      // the user doesn't exist. This prevents timing-based enumeration.
      expect(verifyPassword).toHaveBeenCalled();
    });

    it("should use the same error message for non-existent user and wrong password", async () => {
      // Non-existent user
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (verifyPassword as any).mockResolvedValue(false);

      let error1: AppError | undefined;
      try {
        await loginUser("noone@example.com", "password");
      } catch (e) {
        error1 = e as AppError;
      }

      // Wrong password for existing user
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        passwordHash: "hashed-password",
        emailVerified: true,
        mfaEnabled: false,
      });
      (verifyPassword as any).mockResolvedValue(false);

      let error2: AppError | undefined;
      try {
        await loginUser("test@example.com", "wrong-password");
      } catch (e) {
        error2 = e as AppError;
      }

      // Both should produce identical error messages and codes
      // so an attacker can't distinguish the two cases
      expect(error1!.message).toBe(error2!.message);
      expect(error1!.statusCode).toBe(error2!.statusCode);
      expect(error1!.errorCode).toBe(error2!.errorCode);
    });
  });

  // ─── REFRESH TOKEN REUSE DETECTION ────────────────────────────────────
  // Attack: If an attacker steals a refresh token (e.g., from a
  // compromised device), they try to use it. But the legitimate user
  // may have already rotated it (used it to get a new one).
  //
  // Defense: When a revoked refresh token is used, the system detects
  // this as token theft and revokes ALL sessions for that user. 
  // This is called "automatic reuse detection."
  describe("refresh token reuse detection", () => {
    it("should revoke ALL sessions when a revoked token is reused", async () => {
      // A revoked session means this token was already rotated
      mockPrisma.session.findUnique.mockResolvedValue({
        id: "session-1",
        userId: "user-1",
        revokedAt: new Date(), // already revoked = THEFT INDICATOR
        expiresAt: new Date(Date.now() + 86400_000),
      });
      mockPrisma.session.updateMany.mockResolvedValue({ count: 5 });

      await expect(refreshSession("stolen-token")).rejects.toThrow(
        "Token reuse detected",
      );

      // ALL active sessions for this user should be invalidated
      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });

      // Should log a security warning
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1" }),
        expect.stringContaining("reuse detected"),
      );
    });
  });

  // ─── EXPIRED TOKEN HANDLING ───────────────────────────────────────────
  // Tokens should not be usable after their expiry time.
  describe("expired token handling", () => {
    it("should reject expired email verification token", async () => {
      mockPrisma.emailVerification.findFirst.mockResolvedValue({
        id: "ev-1",
        userId: "user-1",
        expiresAt: new Date(Date.now() - 600_000), // 10 min ago
        usedAt: null,
      });

      await expect(verifyEmail("expired-token")).rejects.toThrow(
        "Token has expired",
      );
    });

    it("should reject expired refresh token and revoke it", async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        id: "session-1",
        userId: "user-1",
        revokedAt: null,
        expiresAt: new Date(Date.now() - 86400_000), // yesterday
      });
      mockPrisma.session.update.mockResolvedValue({});

      await expect(refreshSession("expired-token")).rejects.toThrow(
        "Refresh token expired",
      );

      // The expired session should be explicitly revoked
      expect(mockPrisma.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { revokedAt: expect.any(Date) },
        }),
      );
    });

    it("should reject expired password reset token", async () => {
      mockPrisma.passwordReset.findFirst.mockResolvedValue({
        id: "pr-1",
        userId: "user-1",
        expiresAt: new Date(Date.now() - 600_000), // expired
        usedAt: null,
      });

      await expect(
        resetPassword("expired-token", "NewP@ss1"),
      ).rejects.toThrow("Token has expired");
    });
  });

  // ─── ONE-TIME TOKEN USE (REPLAY ATTACK PREVENTION) ────────────────────
  // Attack: An attacker intercepts an email verification or password
  // reset link and tries to use it multiple times.
  //
  // Defense: Tokens are marked as "used" after first use and subsequent
  // attempts are rejected.
  describe("one-time token use (replay prevention)", () => {
    it("should reject already-used email verification token", async () => {
      mockPrisma.emailVerification.findFirst.mockResolvedValue({
        id: "ev-1",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 600_000),
        usedAt: new Date(), // already used!
      });

      await expect(verifyEmail("used-token")).rejects.toThrow(
        "Token has already been used",
      );
    });

    it("should reject already-used password reset token", async () => {
      mockPrisma.passwordReset.findFirst.mockResolvedValue({
        id: "pr-1",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 600_000),
        usedAt: new Date(), // already used!
      });

      await expect(
        resetPassword("used-token", "NewP@ss1"),
      ).rejects.toThrow("Token has already been used");
    });
  });

  // ─── OAUTH-ONLY ACCOUNT PROTECTION ────────────────────────────────────
  // Users who signed up via OAuth (Google/GitHub/Facebook) don't have
  // a password. Attempts to use password-based features should fail
  // gracefully with the correct error.
  describe("OAuth-only account protection", () => {
    it("should reject password login for OAuth-only accounts", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "oauth-user",
        passwordHash: null, // no password — signed up via OAuth
        emailVerified: true,
        mfaEnabled: false,
      });
      (verifyPassword as any).mockResolvedValue(false);

      let error: AppError | undefined;
      try {
        await loginUser("oauth@example.com", "any-password");
      } catch (e) {
        error = e as AppError;
      }

      // Should get "Invalid credentials" — NOT "No password set"
      // (to prevent account type enumeration)
      expect(error!.message).toBe("Invalid credentials");
      expect(error!.errorCode).toBe(AppErrorCode.InvalidCredentials);
    });

    it("should reject changePassword for OAuth-only accounts with helpful message", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        passwordHash: null, // OAuth-only
      });

      await expect(
        changePassword("oauth-user", "old", "New@Pass1"),
      ).rejects.toThrow("social login");
    });
  });

  // ─── EMAIL ENUMERATION PREVENTION ─────────────────────────────────────
  // Attack: Attacker sends forgot-password requests with different emails
  // to figure out which emails are registered.
  //
  // Defense: The forgot-password endpoint always returns the same
  // response regardless of whether the email exists.
  describe("email enumeration prevention", () => {
    it("should silently succeed for non-existent email on forgot-password", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      // Should NOT throw — just return silently
      await expect(
        forgotPassword("noone@example.com"),
      ).resolves.toBeUndefined();

      // Should NOT send any email or create a reset token
      expect(sendEmail).not.toHaveBeenCalled();
      expect(mockPrisma.passwordReset.create).not.toHaveBeenCalled();
    });

    it("should send email for existing user on forgot-password", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
      });
      mockPrisma.passwordReset.create.mockResolvedValue({});

      await forgotPassword("test@example.com");

      expect(sendEmail).toHaveBeenCalled();
      expect(mockPrisma.passwordReset.create).toHaveBeenCalled();
    });
  });

  // ─── UNVERIFIED EMAIL PROTECTION ──────────────────────────────────────
  // Users who haven't verified their email should not be able to log in.
  // The system should automatically resend a verification email.
  describe("unverified email protection", () => {
    it("should block login and resend verification for unverified email", async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({
          id: "user-1",
          passwordHash: "hashed-password",
          emailVerified: false, // NOT verified
          mfaEnabled: false,
        })
        .mockResolvedValueOnce({
          id: "user-1",
          emailVerified: false,
        });

      mockPrisma.emailVerification.deleteMany.mockResolvedValue({});
      mockPrisma.emailVerification.create.mockResolvedValue({});
      (verifyPassword as any).mockResolvedValue(true);

      const error = await loginUser("test@example.com", "SecureP@ss1").catch(
        (e: AppError) => e,
      );

      expect((error as AppError).message).toContain("Email not verified");
      expect((error as AppError).errorCode).toBe(AppErrorCode.EmailNotVerified);
      // Should have attempted to resend verification
      expect(sendEmail).toHaveBeenCalled();
    });
  });
});
