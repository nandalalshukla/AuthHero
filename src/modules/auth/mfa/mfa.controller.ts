import type { Request, Response } from "express";
import { MFAService } from "./mfa.service";
import { requireAuth } from "../../../utils/requireAuth";

const service = new MFAService();

export const initiateMFA = async (req: Request, res: Response) => {
  requireAuth(req);
  // req.user is guaranteed by requireAuth + authenticate middleware
  // We need the email for the TOTP URI, so fetch it
  const userId = req.user.userId;

  // For MFA setup we need the user's email to generate the TOTP URI
  // The access token only has userId & sessionId, so we pass userId
  // and let the service fetch the email
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

export const challengeMFA = async (req: Request, res: Response) => {
  const { userId, code } = req.body;

  await service.verifyChallenge(userId, code);

  res.json({ success: true, message: "MFA challenge passed" });
};
