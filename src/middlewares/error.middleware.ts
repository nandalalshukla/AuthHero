import { AppError } from "../lib/AppError";
import type { Request, Response, NextFunction } from "express";

export const errorMiddleware = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(err);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errorCode: err.errorCode,
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
};

