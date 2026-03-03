import type { Request, Response } from "express";
import { MFAService } from "./mfa.service";
import { requireAuth } from "../../../utils/requireAuth";
import { verifyMFATempToken } from "../../../config/jwt";
import { refreshTokenCookieOptions } from "../../../config/cookies";
import { OK } from "../../../config/http";

const service = new MFAService();

export const initiateMFA = async (req: Request, res: Response) => {
  requireAuth(req);
  const userId = req.user.userId;

  const data = await service.initiate(userId);

  res.json({ success: true, data });
};

export const verifyMFA = async (req: Request, res: Response) => {
  requireAuth(req);
  const userId = req.user.userId;
  const { token } = req.body;

  await service.verifyAndEnable(userId, token);

  res.json({ success: true, message: "MFA enabled successfully" });
};

/**
 * MFA Challenge — called after login when user has MFA enabled.
 *
 * Flow:
 * 1. Client sends the tempToken (received from POST /auth/login) and the
 *    6-digit TOTP code (or a backup code).
 * 2. We verify the tempToken to securely extract the userId (never trust
 *    the client to send a raw userId).
 * 3. We verify the MFA code against the stored secret.
 * 4. On success, we create a real session and return tokens.
 */
export const challengeMFA = async (req: Request, res: Response) => {
  const { tempToken, code } = req.body;

  // Verify the temp token to extract userId securely
  const { userId } = verifyMFATempToken(tempToken);

  const { accessToken, refreshToken } = await service.verifyChallenge(
    userId,
    code,
    req.headers["user-agent"],
    req.ip,
  );

  // Set refresh token in secure httpOnly cookie
  res.cookie("refreshToken", refreshToken, refreshTokenCookieOptions);

  return res.status(OK).json({
    success: true,
    message: "MFA challenge passed",
    data: { accessToken },
  });
};

/**
 * Disable MFA — requires authentication + current TOTP code for confirmation.
 * Deletes the TOTP secret and backup codes from the database.
 */
export const disableMFA = async (req: Request, res: Response) => {
  requireAuth(req);
  const userId = req.user.userId;
  const { code } = req.body;

  await service.disable(userId, code);

  res.json({ success: true, message: "MFA disabled successfully" });
};

/**
 * Regenerate backup codes — requires authentication + current TOTP code.
 * Replaces all existing backup codes with new ones.
 * Returns the new codes (shown once, then only stored as hashes).
 */
export const regenerateBackupCodes = async (req: Request, res: Response) => {
  requireAuth(req);
  const userId = req.user.userId;
  const { code } = req.body;

  const data = await service.regenerateBackupCodes(userId, code);

  res.json({ success: true, data });
};
