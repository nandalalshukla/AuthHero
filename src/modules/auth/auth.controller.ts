import type { Request, Response } from "express";
import { registerUser, loginUser, verifyEmail } from "./auth.service";
import { CREATED, OK, BAD_REQUEST } from "../../lib/http";
import { emailQueue } from "../../lib/queues/email.queue";

export const registerController = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const { user, verificationToken } = await registerUser(email, password);
  await emailQueue.add("sendVerificationEmail", {
    email: user.email,
    token: verificationToken,
  });
  res.status(CREATED).json({ success: true, data: user });
};

export const verifyEmailController = async (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token || typeof token !== "string") {
    return res.status(BAD_REQUEST).json({
      success: false,
      message: "Token is required",
    });
  }

  const result = await verifyEmail(token);

  return res.status(OK).json({
    success: true,
    message: result.message,
  });
};


export const loginController = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const user = await loginUser(email, password);
  res.status(OK).json({ success: true, data: user });
};
