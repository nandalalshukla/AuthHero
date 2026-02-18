import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";
import { verifyAccessToken } from "../config/jwt";
import { AppError } from "../lib/AppError";
import { UNAUTHORIZED } from "../config/http";

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    sessionId: string;
  };
}

export const authenticate = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError(UNAUTHORIZED, "Authentication required");
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      throw new AppError(UNAUTHORIZED, "Invalid token format");
    }

    const payload = verifyAccessToken(token);

    const { sub: userId, sessionId } = payload as {
      sub: string;
      sessionId: string;
    };

    // Check session in DB
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new AppError(UNAUTHORIZED, "Invalid session");
    }

    if (session.revokedAt) {
      throw new AppError(UNAUTHORIZED, "Session revoked");
    }

    if (session.expiresAt < new Date()) {
      throw new AppError(UNAUTHORIZED, "Session expired");
    }

    req.user = {
      id: userId,
      sessionId,
    };

    next();
  } catch (error) {
    next(error);
  }
};
