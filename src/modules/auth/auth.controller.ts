import type { Request, Response } from "express";
import {
  registerUser,
  loginUser,
  verifyEmail,
  refreshSession,
  logoutAllSessions,
  logoutUser,
  changePassword,
  resetPassword,
  forgotPassword,
} from "./auth.service";
import { CREATED, OK, BAD_REQUEST, UNAUTHORIZED } from "../../config/http";
import { emailQueue } from "../../lib/queues/email.queue";
import { refreshTokenCookieOptions } from "../../config/cookies";
import { requireAuth } from "../../utils/requireAuth";

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
  res.cookie("refreshToken", refreshToken, refreshTokenCookieOptions);
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

export const logoutController = async (req: Request, res: Response) => {

  requireAuth(req);
  const sessionId = req.user.sessionId;
  await logoutUser(sessionId);
  res.clearCookie("refreshToken", {
    ...refreshTokenCookieOptions,
  });

  return res.status(200).json({
    message: "Logged out successfully",
  });
};

export const logoutAllController = async (req: Request, res: Response) => {
  requireAuth(req);
  const userId = req.user.userId;
  await logoutAllSessions(userId);
  res.clearCookie("refreshToken", {
    ...refreshTokenCookieOptions,
  });
  return res.status(OK).json({
    message: "Logged out of all sessions successfully",
  });
};

export const forgotPasswordController = async (req: Request, res: Response) => {
  const { email } = req.body;

  await forgotPassword(email);

  //so i got to know about the enumeration attact, it is a attack where hackers just try to discover valid user infos in your system by trying random brute-force values so we don't return a message in the response like an email has been sent to your account so that the attackers know that an account actually exists with this account and missuse this secret that they now know due to my response so we return same message or some ugly message like if account exists an email has been sent to prevent enumeration attacks.
  return res.status(OK).json({
    message: "If an account exists, a reset link has been sent.",
  });
};

// Reset Password
export const resetPasswordController = async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;

  const result = await resetPassword(token, newPassword);

  return res.status(OK).json(result);
};


export const changePasswordController = async (req: Request, res: Response) => {
  requireAuth(req);
  const userId = req.user.userId;
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(BAD_REQUEST).json({
      success: false,
      message: "Current password and new password are required",
    });
  }
  await changePassword(userId, currentPassword, newPassword);
  return res.status(OK).json({
    success: true,
    message: "Password changed successfully",
  });
};