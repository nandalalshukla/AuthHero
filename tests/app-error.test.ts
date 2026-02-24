import { describe, it, expect } from "vitest";
import { AppError, AppErrorCode } from "../src/lib/AppError";
import { BAD_REQUEST, UNAUTHORIZED, INTERNAL_SERVER_ERROR } from "../src/config/http";

describe("AppError", () => {
  it("should create an error with status code and message", () => {
    const error = new AppError(BAD_REQUEST, "Invalid input");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe("Invalid input");
    expect(error.errorCode).toBeUndefined();
  });

  it("should create an error with an error code", () => {
    const error = new AppError(
      UNAUTHORIZED,
      "Invalid credentials",
      AppErrorCode.InvalidCredentials,
    );

    expect(error.statusCode).toBe(401);
    expect(error.message).toBe("Invalid credentials");
    expect(error.errorCode).toBe("INVALID_CREDENTIALS");
  });

  it("should have a proper stack trace", () => {
    const error = new AppError(INTERNAL_SERVER_ERROR, "Something went wrong");
    expect(error.stack).toBeDefined();
    // Stack trace should contain the file where error was created
    expect(error.stack).toContain("app-error.test.ts");
  });

  it("should have all expected error codes", () => {
    const expectedCodes = [
      "TOKEN_EXPIRED",
      "INVALID_CREDENTIALS",
      "EMAIL_NOT_VERIFIED",
      "EMAIL_ALREADY_EXISTS",
      "TOKEN_INVALID",
      "TOKEN_ALREADY_USED",
      "SESSION_REVOKED",
      "SESSION_EXPIRED",
      "RATE_LIMIT_EXCEEDED",
      "MFA_REQUIRED",
      "MFA_INVALID_CODE",
      "MFA_NOT_SETUP",
      "VALIDATION_FAILED",
    ];

    const actualCodes = Object.values(AppErrorCode);
    expectedCodes.forEach((code) => {
      expect(actualCodes).toContain(code);
    });
  });
});
