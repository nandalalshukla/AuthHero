import type { httpStatusCode } from "../config/http";

export enum AppErrorCode {
  TokenExpired = "TOKEN_EXPIRED",
  InvalidCredentials = "INVALID_CREDENTIALS",
}

export class AppError extends Error {
  public statusCode: httpStatusCode;
  public errorCode?: AppErrorCode;

  constructor(
    statusCode: httpStatusCode,
    message: string,
    errorCode?: AppErrorCode,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;

    Error.captureStackTrace(this, this.constructor);
  }
}
