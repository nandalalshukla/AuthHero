import { describe, it, expect, vi, beforeEach } from "vitest";
import supertest from "supertest";

// ─── What are integration tests? ────────────────────────────────────────
// Unlike unit tests (which test one function in isolation), integration
// tests send REAL HTTP requests through your Express app. This tests
// that all the pieces work together:
//   HTTP request → middleware → validation → controller → service → response
//
// We still mock the database (Prisma) and email because:
// - We don't want tests to depend on a running PostgreSQL/Redis
// - We want tests to be fast and repeatable
// But everything else (Express routing, validation, error handling) is real.

// ─── Mock external infrastructure ───────────────────────────────────────

vi.mock("../src/config/env", () => ({
  env: {
    PORT: "5000",
    NODE_ENV: "test",
    APP_URL: "http://localhost:3000",
    FRONTEND_URL: "http://localhost:3000",
    ACCESS_TOKEN_SECRET: "test-access-secret-key-minimum-10",
    REFRESH_TOKEN_SECRET: "test-refresh-secret-key-minimum-10",
    VERIFY_EMAIL_TOKEN_SECRET: "test-verify-email-secret-min10",
    FORGOT_PSWD_TOKEN_SECRET: "test-forgot-pwd-secret-min10aa",
    RESET_PSWD_TOKEN_SECRET: "test-reset-pwd-secret-min10aaa",
    MFA_TEMP_TOKEN_SECRET: "test-mfa-temp-secret-min10aaaa",
    MFA_ENCRYPTION_KEY:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  },
}));

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
    mFASecret: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../src/utils/hash", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed-password"),
  verifyPassword: vi.fn().mockResolvedValue(true),
}));

vi.mock("../src/utils/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock Redis to prevent real connection attempts
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

// Mock the BullMQ email queue (so we don't need Redis running)
vi.mock("../src/lib/queues/email.queue", () => ({
  emailQueue: {
    add: vi.fn().mockResolvedValue({}),
  },
}));

// Mock rate limiters to disable them in integration tests
// (rate limiting is infrastructure, not business logic)
vi.mock("../src/middlewares/rateLimiter.middleware", () => ({
  loginRateLimiter: (_req: any, _res: any, next: any) => next(),
  registerRateLimiter: (_req: any, _res: any, next: any) => next(),
  verifyEmailRateLimiter: (_req: any, _res: any, next: any) => next(),
  forgotPasswordRateLimiter: (_req: any, _res: any, next: any) => next(),
  resetPasswordRateLimiter: (_req: any, _res: any, next: any) => next(),
  changePasswordRateLimiter: (_req: any, _res: any, next: any) => next(),
  refreshRateLimiter: (_req: any, _res: any, next: any) => next(),
  mfaChallengeRateLimiter: (_req: any, _res: any, next: any) => next(),
}));

// Mock CORS to allow all origins in tests
vi.mock("../src/config/cors", () => ({
  default: (_req: any, _res: any, next: any) => next(),
}));

// Mock Redis to avoid connection errors in test environment
vi.mock("../src/config/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    quit: vi.fn(),
  },
}));

// ─── Now import the app and mocked modules ──────────────────────────────
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { verifyPassword } from "../src/utils/hash";
import { generateAccessToken } from "../src/config/jwt";

const mockPrisma = prisma as any;

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("Integration: Auth API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Health Check ─────────────────────────────────────────────────────
  // The simplest test — just verify the server responds
  describe("GET /health", () => {
    it("should return 200 with status ok", async () => {
      const res = await supertest(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.timestamp).toBeDefined();
    });
  });

  // ─── Registration ────────────────────────────────────────────────────
  describe("POST /auth/register", () => {
    it("should register a new user and return 201", async () => {
      // Arrange: no existing user, transaction creates user
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const mockUser = {
        id: "user-1",
        email: "test@example.com",
        createdAt: new Date().toISOString(),
        emailVerified: false,
        mfaEnabled: false,
      };
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          user: { create: vi.fn().mockResolvedValue(mockUser) },
          emailVerification: { create: vi.fn().mockResolvedValue({}) },
        });
      });

      // Act: send a real HTTP request through Express
      const res = await supertest(app)
        .post("/auth/register")
        .send({ email: "test@example.com", password: "SecureP@ss1" });

      // Assert
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe("test@example.com");
    });

    it("should return 400 for invalid email (validation catches it)", async () => {
      // The validate middleware should reject this BEFORE hitting the service
      const res = await supertest(app)
        .post("/auth/register")
        .send({ email: "not-an-email", password: "SecureP@ss1" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    it("should return 400 for weak password", async () => {
      const res = await supertest(app)
        .post("/auth/register")
        .send({ email: "test@example.com", password: "weak" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("should return 409 when user already exists", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "existing",
        email: "test@example.com",
      });

      const res = await supertest(app)
        .post("/auth/register")
        .send({ email: "test@example.com", password: "SecureP@ss1" });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain("already exists");
    });
  });

  // ─── Login ────────────────────────────────────────────────────────────
  describe("POST /auth/login", () => {
    it("should login and return access token + set cookie", async () => {
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

      const res = await supertest(app)
        .post("/auth/login")
        .send({ email: "test@example.com", password: "SecureP@ss1" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      // Refresh token should be in a Set-Cookie header (httpOnly cookie)
      expect(res.headers["set-cookie"]).toBeDefined();
    });

    it("should return 401 for wrong credentials", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (verifyPassword as any).mockResolvedValue(false);

      const res = await supertest(app)
        .post("/auth/login")
        .send({ email: "test@example.com", password: "wrong" });

      expect(res.status).toBe(401);
      expect(res.body.errorCode).toBe("INVALID_CREDENTIALS");
    });

    it("should return MFA challenge when MFA is enabled", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        passwordHash: "hashed-password",
        emailVerified: true,
        mfaEnabled: true,
      });
      (verifyPassword as any).mockResolvedValue(true);

      const res = await supertest(app)
        .post("/auth/login")
        .send({ email: "test@example.com", password: "SecureP@ss1" });

      expect(res.status).toBe(200);
      expect(res.body.data.mfaRequired).toBe(true);
      expect(res.body.data.tempToken).toBeDefined();
    });
  });

  // ─── Verify Email ─────────────────────────────────────────────────────
  describe("POST /auth/verify-email", () => {
    it("should verify email with valid token", async () => {
      mockPrisma.emailVerification.findFirst.mockResolvedValue({
        id: "ev-1",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 600_000),
        usedAt: null,
        user: { id: "user-1" },
      });
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const res = await supertest(app)
        .post("/auth/verify-email")
        .send({ token: "valid-token" });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("verified");
    });

    it("should return 400 for empty token", async () => {
      const res = await supertest(app)
        .post("/auth/verify-email")
        .send({ token: "" });

      expect(res.status).toBe(400);
    });
  });

  // ─── Forgot Password ─────────────────────────────────────────────────
  describe("POST /auth/forgot-password", () => {
    it("should always return success (prevents email enumeration)", async () => {
      // Even if user doesn't exist, the response should be the same
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const res = await supertest(app)
        .post("/auth/forgot-password")
        .send({ email: "noone@example.com" });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain(
        "If an account exists, a reset link has been sent",
      );
    });
  });

  // ─── Reset Password ──────────────────────────────────────────────────
  describe("POST /auth/reset-password", () => {
    it("should reset password with valid token", async () => {
      mockPrisma.passwordReset.findFirst.mockResolvedValue({
        id: "pr-1",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 600_000),
        usedAt: null,
        user: { id: "user-1" },
      });
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const res = await supertest(app)
        .post("/auth/reset-password")
        .send({ token: "valid-token", newPassword: "NewSecure@1" });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain("reset successfully");
    });
  });

  // ─── Refresh Token ────────────────────────────────────────────────────
  describe("POST /auth/refresh-token", () => {
    it("should return 401 when no refresh token cookie is present", async () => {
      const res = await supertest(app).post("/auth/refresh-token");

      expect(res.status).toBe(401);
      expect(res.body.message).toContain("Refresh token is required");
    });
  });

  // ─── Logout ───────────────────────────────────────────────────────────
  describe("POST /auth/logout", () => {
    it("should return 401 when not authenticated", async () => {
      const res = await supertest(app).post("/auth/logout");

      // No Authorization header → authenticate middleware rejects
      expect(res.status).toBe(401);
    });
  });

  // ─── Change Password ─────────────────────────────────────────────────
  describe("POST /auth/change-password", () => {
    it("should return 401 when not authenticated", async () => {
      const res = await supertest(app)
        .post("/auth/change-password")
        .send({ currentPassword: "old", newPassword: "NewSecure@1" });

      expect(res.status).toBe(401);
    });
  });
});
