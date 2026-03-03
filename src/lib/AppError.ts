import type { httpStatusCode } from "../config/http";

/**
 * Standardized error codes that consumers can programmatically handle.
 *
 * Why this matters for DX:
 * Client apps can switch on errorCode instead of parsing error messages.
 * Messages can be localized; codes are permanent API contracts.
 *
 * Example client usage:
 *   if (error.errorCode === "EMAIL_NOT_VERIFIED") {
 *     showResendVerificationUI();
 *   }
 */
export enum AppErrorCode {
  TokenExpired = "TOKEN_EXPIRED",
  InvalidCredentials = "INVALID_CREDENTIALS",
  EmailNotVerified = "EMAIL_NOT_VERIFIED",
  EmailAlreadyExists = "EMAIL_ALREADY_EXISTS",
  TokenInvalid = "TOKEN_INVALID",
  TokenAlreadyUsed = "TOKEN_ALREADY_USED",
  SessionRevoked = "SESSION_REVOKED",
  SessionExpired = "SESSION_EXPIRED",
  RateLimitExceeded = "RATE_LIMIT_EXCEEDED",
  MFARequired = "MFA_REQUIRED",
  MFAInvalidCode = "MFA_INVALID_CODE",
  MFANotSetup = "MFA_NOT_SETUP",
  ValidationFailed = "VALIDATION_FAILED",
  AccountDeactivated = "ACCOUNT_DEACTIVATED",
  AccountDeleted = "ACCOUNT_DELETED",
}

export class AppError extends Error {
  public readonly statusCode: httpStatusCode;
  public readonly errorCode?: AppErrorCode;

  constructor(statusCode: httpStatusCode, message: string, errorCode?: AppErrorCode) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;

    // Maintains proper stack trace in V8 (Node/Bun)
    Error.captureStackTrace(this, this.constructor);
  }
}
