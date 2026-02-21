import { Request, Response } from "express";
import { MFAService } from "./mfa.service";

const service = new MFAService();

export const initiateMFA = async (req: Request, res: Response) => {
  const userId = req.user.id;
  const email = req.user.email;

  const data = await service.initiate(userId, email);

  res.json(data);
};

export const verifyMFA = async (req: Request, res: Response) => {
  const userId = req.user.id;
  const { token } = req.body;

  await service.verifyAndEnable(userId, token);

  res.json({ success: true });
};

export const challengeMFA = async (req: Request, res: Response) => {
  const { userId, code } = req.body;

  await service.verifyChallenge(userId, code);

  res.json({ success: true });
};
