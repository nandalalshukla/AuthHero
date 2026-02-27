import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// ─── Why mock req/res/next? ─────────────────────────────────────────────
// Middleware functions take (req, res, next) from Express. In tests, we
// create plain objects that look like Express objects but let us control
// and inspect their behavior. This way we can test middleware without
// starting a real HTTP server.

// ═══════════════════════════════════════════════════════════════════════
// 1. ERROR MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════
// The error middleware is Express's final safety net.
// It catches all errors and returns proper JSON responses.

// Mock the logger so it doesn't print during tests
vi.mock("../src/config/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { errorMiddleware } from "../src/middlewares/error.middleware";
import { AppError, AppErrorCode } from "../src/lib/AppError";
import { BAD_REQUEST, UNAUTHORIZED, INTERNAL_SERVER_ERROR } from "../src/config/http";

// Helper: creates a fake Express Response object
// We mock the methods that middleware calls: status(), json()
function createMockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res); // chainable: res.status(400).json(...)
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe("errorMiddleware", () => {
  it("should handle AppError with correct status and message", () => {
    const err = new AppError(BAD_REQUEST, "Invalid input", AppErrorCode.ValidationFailed);
    const req = {} as Request;
    const res = createMockRes();
    const next = vi.fn();

    errorMiddleware(err, req, res, next);

    // Should set the HTTP status code from the AppError
    expect(res.status).toHaveBeenCalledWith(400);
    // Should include the error message and error code in the response
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Invalid input",
      errorCode: "VALIDATION_FAILED",
    });
  });

  it("should handle AppError without error code", () => {
    const err = new AppError(UNAUTHORIZED, "Auth required");
    const req = {} as Request;
    const res = createMockRes();
    const next = vi.fn();

    errorMiddleware(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    // When there's no errorCode, it should NOT be in the response
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Auth required",
    });
  });

  it("should return 500 for unknown/unexpected errors", () => {
    const err = new Error("Something crashed");
    const req = {} as Request;
    const res = createMockRes();
    const next = vi.fn();

    errorMiddleware(err, req, res, next);

    // Unknown errors should always return 500 with a generic message
    // (never leak internal error details to the client!)
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Internal Server Error",
    });
  });

  it("should return 500 for non-Error objects thrown", () => {
    const err = "just a string error"; // someone threw a string
    const req = {} as Request;
    const res = createMockRes();
    const next = vi.fn();

    errorMiddleware(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Internal Server Error",
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. VALIDATE MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════
// The validate middleware wraps Zod schemas.
// It parses req.body (or req.body + req.query + req.params) and:
// - If valid → calls next()
// - If invalid → returns 400 with field-level errors

import { validate } from "../src/middlewares/validate.middleware";
import { z } from "zod";

describe("validate middleware", () => {
  const testSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
  });

  it("should call next() when body is valid", async () => {
    const req = {
      body: { email: "a@b.com", password: "12345678" },
      query: {},
      params: {},
    } as unknown as Request;
    const res = createMockRes();
    const next = vi.fn();

    await validate(testSchema)(req, res, next);

    // Middleware should pass control to the next handler
    expect(next).toHaveBeenCalled();
    // Should NOT have sent an error response
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should return 400 with field errors when body is invalid", async () => {
    const req = {
      body: { email: "not-email", password: "short" },
      query: {},
      params: {},
    } as unknown as Request;
    const res = createMockRes();
    const next = vi.fn();

    await validate(testSchema)(req, res, next);

    // Should return a 400 validation error
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Validation failed",
        errors: expect.any(Object),
      }),
    );
  });

  it("should work with nested schema (body/query/params)", async () => {
    const nestedSchema = z.object({
      body: z.object({ name: z.string() }),
      query: z.object({ page: z.string().optional() }),
    });

    const req = {
      body: { name: "John" },
      query: {},
      params: {},
    } as unknown as Request;
    const res = createMockRes();
    const next = vi.fn();

    await validate(nestedSchema, "nested")(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════
// The authenticate middleware:
// 1. Extracts the Bearer token from the Authorization header
// 2. Verifies it's a valid JWT
// 3. Looks up the session in the database
// 4. Checks the session isn't revoked or expired
// 5. Attaches req.user = { userId, sessionId }

// We need to mock JWT verification and Prisma
vi.mock("../src/config/jwt", () => ({
  verifyAccessToken: vi.fn(),
}));

vi.mock("../src/config/prisma", () => ({
  prisma: {
    session: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    mFASecret: {
      findUnique: vi.fn(),
    },
  },
}));

import { authenticate } from "../src/middlewares/auth.middleware";
import { verifyAccessToken } from "../src/config/jwt";
import { prisma } from "../src/config/prisma";

const mockPrisma = prisma as any;

describe("authenticate middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should attach req.user and call next() for valid token + session", async () => {
    // Arrange: JWT returns valid payload, session exists and is active
    (verifyAccessToken as any).mockReturnValue({
      userId: "user-1",
      sessionId: "session-1",
    });
    mockPrisma.session.findUnique.mockResolvedValue({
      id: "session-1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400_000), // tomorrow
    });

    const req = {
      headers: { authorization: "Bearer valid-jwt-token" },
    } as unknown as Request;
    const res = createMockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    // Should call next() without error
    expect(next).toHaveBeenCalledWith();
    // Should set req.user with userId and sessionId
    expect((req as any).user).toEqual({
      userId: "user-1",
      sessionId: "session-1",
    });
  });

  it("should call next(error) when no Authorization header", async () => {
    const req = { headers: {} } as unknown as Request;
    const res = createMockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    // Should forward an error to the error middleware
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const error = next.mock.calls[0]?.[0] as AppError;
    expect(error.message).toBe("Authentication required");
  });

  it("should call next(error) when token format is wrong", async () => {
    const req = {
      headers: { authorization: "NotBearer token" },
    } as unknown as Request;
    const res = createMockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  it("should call next(error) when session is not found", async () => {
    (verifyAccessToken as any).mockReturnValue({
      userId: "user-1",
      sessionId: "session-1",
    });
    mockPrisma.session.findUnique.mockResolvedValue(null);

    const req = {
      headers: { authorization: "Bearer valid-token" },
    } as unknown as Request;
    const res = createMockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const error = next.mock.calls[0]?.[0] as AppError;
    expect(error.message).toBe("Invalid session");
  });

  it("should call next(error) when session is revoked", async () => {
    (verifyAccessToken as any).mockReturnValue({
      userId: "user-1",
      sessionId: "session-1",
    });
    mockPrisma.session.findUnique.mockResolvedValue({
      id: "session-1",
      revokedAt: new Date(), // revoked!
      expiresAt: new Date(Date.now() + 86400_000),
    });

    const req = {
      headers: { authorization: "Bearer valid-token" },
    } as unknown as Request;
    const res = createMockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    const error = next.mock.calls[0]?.[0] as AppError;
    expect(error.message).toBe("Session revoked");
  });

  it("should call next(error) when session is expired", async () => {
    (verifyAccessToken as any).mockReturnValue({
      userId: "user-1",
      sessionId: "session-1",
    });
    mockPrisma.session.findUnique.mockResolvedValue({
      id: "session-1",
      revokedAt: null,
      expiresAt: new Date(Date.now() - 86400_000), // yesterday
    });

    const req = {
      headers: { authorization: "Bearer valid-token" },
    } as unknown as Request;
    const res = createMockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    const error = next.mock.calls[0]?.[0] as AppError;
    expect(error.message).toBe("Session expired");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. REQUIRE MFA MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════
// This middleware guards sensitive routes. It checks:
// - If user has MFA enabled → verify MFA is properly set up
// - If user doesn't have MFA → let them through (they opted out)

// We reuse the same Prisma mock from above
import { requireMFA } from "../src/middlewares/mfa.middleware";

describe("requireMFA middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call next() when user has no MFA (opted out)", async () => {
    const req = {
      user: { userId: "user-1", sessionId: "s-1" },
    } as unknown as Request;
    const res = createMockRes();
    const next = vi.fn();

    mockPrisma.user.findUnique.mockResolvedValue({ mfaEnabled: false });

    await requireMFA(req, res, next);

    // User without MFA should pass through freely
    expect(next).toHaveBeenCalledWith();
  });

  it("should call next() when user has MFA enabled and verified", async () => {
    const req = {
      user: { userId: "user-1", sessionId: "s-1" },
    } as unknown as Request;
    const res = createMockRes();
    const next = vi.fn();

    mockPrisma.user.findUnique.mockResolvedValue({ mfaEnabled: true });
    mockPrisma.mFASecret.findUnique.mockResolvedValue({ verified: true });

    await requireMFA(req, res, next);

    // MFA is enabled AND verified — allow through
    expect(next).toHaveBeenCalledWith();
  });

  it("should call next(error) when MFA is enabled but not verified", async () => {
    const req = {
      user: { userId: "user-1", sessionId: "s-1" },
    } as unknown as Request;
    const res = createMockRes();
    const next = vi.fn();

    mockPrisma.user.findUnique.mockResolvedValue({ mfaEnabled: true });
    mockPrisma.mFASecret.findUnique.mockResolvedValue({ verified: false });

    await requireMFA(req, res, next);

    // Inconsistent state — MFA enabled but not verified
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const error = next.mock.calls[0]?.[0] as AppError;
    expect(error.message).toContain("MFA setup is incomplete");
  });

  it("should call next(error) when req.user is missing", async () => {
    const req = {} as unknown as Request;
    const res = createMockRes();
    const next = vi.fn();

    await requireMFA(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const error = next.mock.calls[0]?.[0] as AppError;
    expect(error.message).toBe("Authentication required");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. ASYNC HANDLER
// ═══════════════════════════════════════════════════════════════════════
// asyncHandler wraps async route handlers so that thrown errors
// are automatically forwarded to Express's error middleware via next().
// Without it, unhandled promise rejections crash the server.

import { asyncHandler } from "../src/lib/asyncHandler";

describe("asyncHandler", () => {
  it("should forward errors from async handlers to next()", async () => {
    const handlerError = new Error("Something went wrong");
    const failingHandler = async () => {
      throw handlerError;
    };

    const req = {} as Request;
    const res = createMockRes();
    const next = vi.fn();

    // Wrap the failing handler and call it
    await asyncHandler(failingHandler as any)(req, res, next);

    // The error should be forwarded to next(), not thrown
    expect(next).toHaveBeenCalledWith(handlerError);
  });

  it("should not call next(error) when handler succeeds", async () => {
    const successHandler = async (_req: Request, res: Response) => {
      res.status(200).json({ ok: true });
    };

    const req = {} as Request;
    const res = createMockRes();
    const next = vi.fn();

    await asyncHandler(successHandler)(req, res, next);

    // next() should NOT have been called with an error
    expect(next).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. REQUIRE AUTH UTILITY
// ═══════════════════════════════════════════════════════════════════════
// requireAuth is a type-narrowing guard that throws if req.user is missing.
// Used inside controllers that need authentication.

import { requireAuth } from "../src/utils/requireAuth";

describe("requireAuth", () => {
  it("should not throw when req.user exists", () => {
    const req = {
      user: { userId: "user-1", sessionId: "session-1" },
    } as unknown as Request;

    // Should not throw
    expect(() => requireAuth(req)).not.toThrow();
  });

  it("should throw AppError when req.user is missing", () => {
    const req = {} as Request;

    expect(() => requireAuth(req)).toThrow(AppError);
    expect(() => requireAuth(req)).toThrow("Authentication required");
  });
});
