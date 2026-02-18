import type { Request, Response } from "express";
import {
  registerUser,
  loginUser,
  verifyEmail,
  refreshSession,
} from "./auth.service";
import { CREATED, OK, BAD_REQUEST, UNAUTHORIZED } from "../../config/http";
import { emailQueue } from "../../lib/queues/email.queue";
import { refreshTokenCookieOptions } from "../../config/cookies";

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
  const ipAddress = req.ip;
  const userAgent = req.headers["user-agent"] || "unknown";
  const { email, password } = req.body;
  const { accessToken, refreshToken } = await loginUser(
    email,
    password,
    userAgent,
    ipAddress,
  );

  // Set refresh token in secure httpOnly cookie
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/auth/refresh",
  });

  return res.status(OK).json({
    accessToken,
  });
};

export const refreshController = async (req: Request, res: Response) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(UNAUTHORIZED).json({ message: "Unauthorized" });
  }

  const { accessToken, refreshToken: newRefreshToken } = await refreshSession(
    refreshToken,
    req.headers["user-agent"],
    req.ip,
  );

  res.cookie("refreshToken", newRefreshToken, refreshTokenCookieOptions);

  return res.status(OK).json({ accessToken });
};
