import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";
import { AppError, AppErrorCode } from "../lib/AppError";
import { FORBIDDEN } from "../config/http";

/**
 * Middleware that enforces MFA verification on sensitive routes.
 *
 * Use this on routes that should be extra-protected (e.g., changing email,
 * deleting account, viewing sensitive data). It ensures that:
 *
 * 1. If the user has MFA enabled, their MFA setup is verified.
 * 2. If a user somehow has mfaEnabled=true but no verified MFASecret,
 *    it catches the inconsistency.
 *
 * This is a route-level guard — it does NOT replace the login MFA challenge.
 * The login MFA challenge prevents session creation entirely.
 * This middleware adds an extra layer for critical operations.
 *
 * Usage:
 *   router.post("/delete-account", authenticate, requireMFA, handler);
 */
export const requireMFA = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AppError(FORBIDDEN, "Authentication required");
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { mfaEnabled: true },
    });

    // If user doesn't have MFA enabled, allow through
    // (they opted out of the extra security)
    if (!user?.mfaEnabled) {
      return next();
    }

    // Verify that MFA is properly set up (catch data inconsistencies)
    const mfaSecret = await prisma.mFASecret.findUnique({
      where: { userId: req.user.userId },
      select: { verified: true },
    });

    if (!mfaSecret?.verified) {
      throw new AppError(
        FORBIDDEN,
        "MFA setup is incomplete. Please complete MFA setup first.",
        AppErrorCode.MFANotSetup,
      );
    }

    // MFA is enabled and verified — allow through
    next();
  } catch (error) {
    next(error);
  }
};
