// src/utils/requireAuth.ts

import type { Request } from "express";
import { AppError } from "../lib/AppError";
import { UNAUTHORIZED } from "../config/http";
import type { AccessTokenPayload } from "../modules/auth/auth.types";

export function requireAuth(
  req: Request,
): asserts req is Request & { user: AccessTokenPayload } {
  if (!req.user) {
    throw new AppError(UNAUTHORIZED, "Authentication required");
  }
}
