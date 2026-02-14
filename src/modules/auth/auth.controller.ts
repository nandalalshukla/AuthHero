import type { Request, Response } from "express";
import { registerUser, verifyEmail, loginUser } from "./auth.service";
import { CREATED, OK } from "../../lib/http";
import { emailQueue } from "../../lib/queues/email.queue";

export const register = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const { user, verificationToken } = await registerUser(email, password);
  await emailQueue.add("verifyEmail",{email: user.email, token: verificationToken});
  res.status(CREATED).json({ success: true, data: user });
};

export const login = async (req: Request, res: Response) => {
    const { email, password } = req.body;
    const user = await loginUser(email, password);
    res.status(OK).json({ success: true, data: user });
};


