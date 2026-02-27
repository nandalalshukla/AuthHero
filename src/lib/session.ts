import { prisma } from "../config/prisma";
import { generateAccessToken, generateRandomToken, hashRandomToken } from "../config/jwt";
import { addDays } from "date-fns";
import { TOKEN_LENGTH, TOKEN_EXPIRY } from "../config/constants";

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Creates a new authenticated session for a user.
 *
 * This is the single source of truth for session creation — used by:
 * - Email/password login
 * - MFA challenge completion
 * - OAuth callback
 *
 * Centralizing this prevents drift between flows and ensures every
 * session gets the same security properties (token length, expiry, etc.).
 */
export async function createSession(
  userId: string,
  userAgent?: string,
  ipAddress?: string,
): Promise<SessionTokens> {
  const refreshToken = generateRandomToken(TOKEN_LENGTH.REFRESH);
  const refreshTokenHash = hashRandomToken(refreshToken);
  const expiresAt = addDays(new Date(), TOKEN_EXPIRY.REFRESH_TOKEN_DAYS);

  const session = await prisma.session.create({
    data: {
      userId,
      refreshTokenHash,
      expiresAt,
      userAgent,
      ipAddress,
    },
  });

  const accessToken = generateAccessToken(userId, session.id);

  return { accessToken, refreshToken };
}
