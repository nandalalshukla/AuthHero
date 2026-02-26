import { AppError } from "../lib/AppError";
import type { Request, Response, NextFunction } from "express";
import { INTERNAL_SERVER_ERROR } from "../config/http";
import { logger } from "../lib/logger";

export const errorMiddleware = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  // Known operational errors (e.g. "Invalid credentials")
  if (err instanceof AppError) {
    // Only log 5xx AppErrors as errors, 4xx as debug
    if (err.statusCode >= 500) {
      logger.error({ err, statusCode: err.statusCode }, err.message);
    } else {
      logger.debug({ statusCode: err.statusCode }, err.message);
    }

    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errorCode && { errorCode: err.errorCode }),
    });
  }

  // Unknown/unexpected errors — log full details, return generic message
  logger.error({ err }, "Unhandled error");

  return res.status(INTERNAL_SERVER_ERROR).json({
    success: false,
    message: "Internal Server Error",
  });
};
