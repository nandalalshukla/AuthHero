import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock all external dependencies BEFORE importing the service ────────
// This is crucial: vi.mock() is hoisted to the top of the file by Vitest,
// so the service module will receive the mocked versions when it loads.

// Mock environment variables
vi.mock("../src/config/env", () => ({
  env: {
    APP_URL: "http://localhost:3000",
    ACCESS_TOKEN_SECRET: "test-access-secret-key-minimum-10",
    REFRESH_TOKEN_SECRET: "test-refresh-secret-key-minimum-10",
    MFA_TEMP_TOKEN_SECRET: "test-mfa-temp-secret-min10aaaa",
  },
}));

// Mock the email queue to prevent BullMQ connection
vi.mock("../src/lib/queues/email.queue", () => ({
  emailQueue: {
    add: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock("../src/config/redis", () => ({
  redisClient: {
    on: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    quit: vi.fn(),
  },
  redisConnection: {
    host: "localhost",
    port: 6379,
  },
}));

// Mock Prisma — this replaces the real database with fake functions
// that we can control in each test.
vi.mock("../src/config/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    emailVerification: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    passwordReset: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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

// Mock hashing utilities — we don't want to wait for real argon2 in tests
vi.mock("../src/utils/hash", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed-password"),
  verifyPassword: vi.fn().mockResolvedValue(true),
}));

// Mock email sending — we don't send real emails
vi.mock("../src/utils/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock JWT utilities — use predictable return values
vi.mock("../src/config/jwt", () => ({
  generateAccessToken: vi.fn().mockReturnValue("mock-access-token"),
  generateRandomToken: vi.fn().mockReturnValue("mock-random-token"),
  hashRandomToken: vi.fn().mockReturnValue("mock-hashed-token"),
  generateMFATempToken: vi.fn().mockReturnValue("mock-mfa-temp-token"),
}));

// Mock the logger to suppress log output during tests
vi.mock("../src/config/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ─── Now import the service and mocked modules ─────────────────────────
import {
  registerUser,
  verifyEmail,
  loginUser,
  refreshSession,
  logoutUser,
  logoutAllSessions,
  forgotPassword,
  resetPassword,
  changePassword,
  sendVerificationEmail,
} from "../src/modules/auth/auth.service";

import { prisma } from "../src/config/prisma";
import { emailQueue } from "../src/lib/queues/email.queue";
import { emailQueue } from "../src/lib/queues/email.queue";
import { verifyPassword, hashPassword } from "../src/utils/hash";
import { sendEmail } from "../src/utils/email";
import { AppError } from "../src/lib/AppError";

// ─── Type-cast mocks so we can use .mockResolvedValue(), etc. ───────────
const mockPrisma = prisma as any;

// ═══════════════════════════════════════════════════════════════════════
// TESTS START HERE
// ═══════════════════════════════════════════════════════════════════════

describe("auth.service", () => {
  // Reset all mock state before each test so tests don't interfere
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── registerUser ─────────────────────────────────────────────────────
  // What it should do:
  // 1. Check if user already exists → throw if yes
  // 2. Hash the password
  // 3. Create user + email verification record in a transaction
  // 4. Return the user and a verification token
  describe("registerUser", () => {
    it("should register a new user successfully", async () => {
      // Arrange: simulate that no existing user was found
      mockPrisma.user.findUnique.mockResolvedValue(null);

      // Simulate the $transaction creating a user
      const mockUser = {
        id: "user-1",
        email: "test@example.com",
        createdAt: new Date(),
        emailVerified: false,
        mfaEnabled: false,
      };
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        // The service passes a callback function to $transaction
        return fn({
          user: { create: vi.fn().mockResolvedValue(mockUser) },
          emailVerification: { create: vi.fn().mockResolvedValue({}) },
        });
      });

      // Act
      const result = await registerUser("test@example.com", "SecureP@ss1");

      // Assert
      expect(result.user.email).toBe("test@example.com");
      expect(result.verificationToken).toBeDefined();
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
      });
    });

    it("should throw if user already exists", async () => {
      // Arrange: simulate an existing user found in DB
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "existing-user",
        email: "test@example.com",
      });

      // Act & Assert: expect an AppError with 409 status
      await expect(
        registerUser("test@example.com", "SecureP@ss1"),
      ).rejects.toThrow(AppError);

      await expect(
        registerUser("test@example.com", "SecureP@ss1"),
      ).rejects.toThrow("User already exists");
    });
  });

  // ─── sendVerificationEmail ────────────────────────────────────────────
  // What it should do:
  // 1. Build a verification URL with the token
  // 2. Send the email via the email utility
  describe("sendVerificationEmail", () => {
    it("should send an email with verification link", async () => {
      await sendVerificationEmail("test@example.com", "some-token");

      expect(sendEmail).toHaveBeenCalledWith(
        "test@example.com",
        "Verify Your Email",
        expect.stringContaining("some-token"),
      );
    });
  });

  // ─── verifyEmail ──────────────────────────────────────────────────────
  // What it should do:
  // 1. Hash the token and look it up in DB
  // 2. Throw if not found, expired, or already used
  // 3. Mark user as verified and token as used
  describe("verifyEmail", () => {
    it("should verify email with a valid token", async () => {
      const futureDate = new Date(Date.now() + 600_000); // 10 min from now
      mockPrisma.emailVerification.findFirst.mockResolvedValue({
        id: "ev-1",
        userId: "user-1",
        tokenHash: "mock-hashed-token",
        expiresAt: futureDate,
        usedAt: null,
        user: { id: "user-1" },
      });
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await verifyEmail("valid-token");

      expect(result.message).toBe("Email verified successfully");
    });

    it("should throw if token is not found", async () => {
      mockPrisma.emailVerification.findFirst.mockResolvedValue(null);

      await expect(verifyEmail("bad-token")).rejects.toThrow(
        "Invalid or expired token",
      );
    });

    it("should throw if token has expired", async () => {
      const pastDate = new Date(Date.now() - 600_000); // 10 min ago
      mockPrisma.emailVerification.findFirst.mockResolvedValue({
        id: "ev-1",
        userId: "user-1",
        expiresAt: pastDate,
        usedAt: null,
      });

      await expect(verifyEmail("expired-token")).rejects.toThrow(
        "Token has expired",
      );
    });

    it("should throw if token has already been used", async () => {
      const futureDate = new Date(Date.now() + 600_000);
      mockPrisma.emailVerification.findFirst.mockResolvedValue({
        id: "ev-1",
        userId: "user-1",
        expiresAt: futureDate,
        usedAt: new Date(), // already used!
      });

      await expect(verifyEmail("used-token")).rejects.toThrow(
        "Token has already been used",
      );
    });
  });

  // ─── loginUser ────────────────────────────────────────────────────────
  // What it should do:
  // 1. Look up user by email
  // 2. Compare password (timing-safe against dummy hash if user not found)
  // 3. Throw if credentials invalid
  // 4. Throw if email not verified
  // 5. If MFA enabled → return temp token
  // 6. If no MFA → create session and return tokens
  describe("loginUser", () => {
    it("should login successfully and return tokens", async () => {
      // Arrange: user exists, has verified email, no MFA
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        passwordHash: "hashed-password",
        emailVerified: true,
        mfaEnabled: false,
      });
      (verifyPassword as any).mockResolvedValue(true);

      mockPrisma.session.create.mockResolvedValue({
        id: "session-1",
        userId: "user-1",
      });

      // Act
      const result = await loginUser("test@example.com", "SecureP@ss1");

      // Assert: should return tokens, not MFA challenge
      expect(result.mfaRequired).toBe(false);
      if (!result.mfaRequired) {
        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
      }
    });

    it("should throw for non-existent user", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (verifyPassword as any).mockResolvedValue(false);

      await expect(
        loginUser("noone@example.com", "password"),
      ).rejects.toThrow("Invalid credentials");
    });

    it("should throw for wrong password", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        passwordHash: "hashed-password",
        emailVerified: true,
        mfaEnabled: false,
      });
      (verifyPassword as any).mockResolvedValue(false);

      await expect(
        loginUser("test@example.com", "wrong-password"),
      ).rejects.toThrow("Invalid credentials");
    });

    it("should throw for OAuth-only account (no password hash)", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        passwordHash: null, // OAuth-only — no password set
        emailVerified: true,
        mfaEnabled: false,
      });
      (verifyPassword as any).mockResolvedValue(false);

      await expect(
        loginUser("oauth@example.com", "any-password"),
      ).rejects.toThrow("Invalid credentials");
    });

    it("should throw if email is not verified", async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({
          id: "user-1",
          passwordHash: "hashed-password",
          emailVerified: false,
          mfaEnabled: false,
        })
        // resendVerificationEmail also calls findUnique internally
        .mockResolvedValueOnce({
          id: "user-1",
          emailVerified: false,
        });

      mockPrisma.emailVerification.deleteMany.mockResolvedValue({});
      mockPrisma.emailVerification.create.mockResolvedValue({});
      (verifyPassword as any).mockResolvedValue(true);

      await expect(
        loginUser("test@example.com", "SecureP@ss1"),
      ).rejects.toThrow("Email not verified");
    });

    it("should return MFA temp token when MFA is enabled", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        passwordHash: "hashed-password",
        emailVerified: true,
        mfaEnabled: true, // MFA is on!
      });
      (verifyPassword as any).mockResolvedValue(true);

      const result = await loginUser("test@example.com", "SecureP@ss1");

      expect(result.mfaRequired).toBe(true);
      if (result.mfaRequired) {
        expect(result.tempToken).toBeDefined();
      }
    });
  });

  // ─── refreshSession ──────────────────────────────────────────────────
  // What it should do:
  // 1. Hash the refresh token and find the session
  // 2. If session was revoked → revoke ALL user sessions (reuse detection!)
  // 3. If expired → revoke session
  // 4. Generate new refresh token (rotation) and access token
  describe("refreshSession", () => {
    it("should rotate tokens successfully", async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        id: "session-1",
        userId: "user-1",
        refreshTokenHash: "mock-hashed-token",
        expiresAt: new Date(Date.now() + 86400_000), // tomorrow
        revokedAt: null,
        userAgent: "test-agent",
        ipAddress: "127.0.0.1",
      });
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          session: {
            update: vi.fn().mockResolvedValue({
              id: "session-1",
              userId: "user-1",
            }),
          },
        });
      });

      const result = await refreshSession("old-refresh-token");

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it("should throw for invalid refresh token", async () => {
      mockPrisma.session.findUnique.mockResolvedValue(null);

      await expect(refreshSession("bad-token")).rejects.toThrow(
        "Invalid refresh token",
      );
    });

    it("should revoke ALL sessions on token reuse", async () => {
      // Simulate a revoked session (token reuse!)
      mockPrisma.session.findUnique.mockResolvedValue({
        id: "session-1",
        userId: "user-1",
        revokedAt: new Date(), // already revoked = reuse detected
        expiresAt: new Date(Date.now() + 86400_000),
      });
      mockPrisma.session.updateMany.mockResolvedValue({ count: 3 });

      await expect(refreshSession("reused-token")).rejects.toThrow(
        "Token reuse detected",
      );

      // Verify that ALL sessions for this user were revoked
      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          revokedAt: null,
        },
        data: {
          revokedAt: expect.any(Date),
        },
      });
    });

    it("should throw for expired refresh token", async () => {
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
    });
  });

  // ─── logoutUser ───────────────────────────────────────────────────────
  // What it should do:
  // 1. Find the session by ID
  // 2. Throw if session doesn't exist or is already revoked
  // 3. Mark the session as revoked
  describe("logoutUser", () => {
    it("should revoke the session", async () => {
      mockPrisma.session.findUnique.mockResolvedValue({
        id: "session-1",
        revokedAt: null,
      });
      mockPrisma.session.update.mockResolvedValue({});

      const result = await logoutUser("session-1");

      expect(result.message).toBe("Logged out successfully");
      expect(mockPrisma.session.update).toHaveBeenCalledWith({
        where: { id: "session-1" },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it("should throw for invalid/revoked session", async () => {
      mockPrisma.session.findUnique.mockResolvedValue(null);

      await expect(logoutUser("bad-session")).rejects.toThrow(
        "Invalid session",
      );
    });
  });

  // ─── logoutAllSessions ────────────────────────────────────────────────
  // What it should do: revoke ALL active sessions for a user
  describe("logoutAllSessions", () => {
    it("should revoke all sessions for a user", async () => {
      mockPrisma.session.updateMany.mockResolvedValue({ count: 3 });

      const result = await logoutAllSessions("user-1");

      expect(result.message).toContain("All sessions logged out");
      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  // ─── forgotPassword ───────────────────────────────────────────────────
  // What it should do:
  // 1. If user doesn't exist → silently return (no enumeration!)
  // 2. If user exists → create reset token and send email
  describe("forgotPassword", () => {
    it("should create a reset token and send email for existing user", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
      });
      mockPrisma.passwordReset.create.mockResolvedValue({});

      await forgotPassword("test@example.com");

      expect(mockPrisma.passwordReset.create).toHaveBeenCalled();
      expect(emailQueue.add).toHaveBeenCalled();
    });

    it("should silently return for non-existent user (prevents enumeration)", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      // Should NOT throw — silent exit
      await forgotPassword("noone@example.com");

      // Should NOT attempt to create a reset token or send email
      expect(mockPrisma.passwordReset.create).not.toHaveBeenCalled();
      expect(emailQueue.add).not.toHaveBeenCalled();
    });
  });

  // ─── resetPassword ────────────────────────────────────────────────────
  // What it should do:
  // 1. Look up the reset token
  // 2. Throw if invalid, expired, or already used
  // 3. Hash new password, update user, mark token as used
  describe("resetPassword", () => {
    it("should reset password with a valid token", async () => {
      mockPrisma.passwordReset.findFirst.mockResolvedValue({
        id: "pr-1",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 600_000),
        usedAt: null,
        user: { id: "user-1" },
      });
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await resetPassword("valid-token", "NewSecure@1");

      expect(result.message).toBe("Password reset successfully");
    });

    it("should throw for invalid token", async () => {
      mockPrisma.passwordReset.findFirst.mockResolvedValue(null);

      await expect(
        resetPassword("invalid-token", "NewSecure@1"),
      ).rejects.toThrow("Invalid or expired token");
    });

    it("should throw for already-used token", async () => {
      mockPrisma.passwordReset.findFirst.mockResolvedValue({
        id: "pr-1",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 600_000),
        usedAt: new Date(), // already used!
      });

      await expect(
        resetPassword("used-token", "NewSecure@1"),
      ).rejects.toThrow("Token has already been used");
    });

    it("should throw for expired token", async () => {
      mockPrisma.passwordReset.findFirst.mockResolvedValue({
        id: "pr-1",
        userId: "user-1",
        expiresAt: new Date(Date.now() - 600_000), // expired
        usedAt: null,
      });

      await expect(
        resetPassword("expired-token", "NewSecure@1"),
      ).rejects.toThrow("Token has expired");
    });
  });

  // ─── changePassword ──────────────────────────────────────────────────
  // What it should do:
  // 1. Find the user
  // 2. Throw if user doesn't exist
  // 3. Throw if user has no password (OAuth-only)
  // 4. Verify current password → throw if wrong
  // 5. Hash and save new password
  describe("changePassword", () => {
    it("should change password successfully", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        passwordHash: "old-hashed-password",
      });
      (verifyPassword as any).mockResolvedValue(true);
      (hashPassword as any).mockResolvedValue("new-hashed-password");
      mockPrisma.user.update.mockResolvedValue({});

      const result = await changePassword("user-1", "OldP@ss1", "NewP@ss1");

      expect(result.message).toBe("Password changed successfully");
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { passwordHash: "new-hashed-password" },
      });
    });

    it("should throw if user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        changePassword("no-user", "old", "new"),
      ).rejects.toThrow("User not found");
    });

    it("should throw for OAuth-only account (no password)", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        passwordHash: null, // OAuth-only
      });

      await expect(
        changePassword("user-1", "old", "new"),
      ).rejects.toThrow("social login");
    });

    it("should throw for incorrect current password", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        passwordHash: "hashed-password",
      });
      (verifyPassword as any).mockResolvedValue(false);

      await expect(
        changePassword("user-1", "wrong-pass", "NewP@ss1"),
      ).rejects.toThrow("Current password is incorrect");
    });
  });
});
