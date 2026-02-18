import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";
import { verifyAccessToken } from "../config/jwt";
import { AppError } from "../lib/AppError";
import { UNAUTHORIZED } from "../config/http";
import type { AccessTokenPayload } from "../modules/auth/auth.types";

interface AuthenticatedRequest extends Request {
  user?: AccessTokenPayload;
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

    const { userId, sessionId } = payload as AccessTokenPayload;

    //Check session in DB
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
        userId,
      sessionId,
    };

    next();
  } catch (error) {
    next(error);
  }
};
