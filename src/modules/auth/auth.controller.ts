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
  getMe,
  deactivateAccount,
  reactivateAccount,
  deleteAccount,
} from "./auth.service";
import { CREATED, OK, UNAUTHORIZED } from "../../config/http";
import { emailQueue } from "../../lib/queues/email.queue";
import { refreshTokenCookieOptions } from "../../config/cookies";
import { requireAuth } from "../../utils/requireAuth";

export const registerController = async (req: Request, res: Response) => {
  const { fullname, email, password } = req.body;
  const { user, verificationToken } = await registerUser(fullname, email, password);

  // Queue verification email (async via BullMQ — doesn't block the response)
  await emailQueue.add("sendVerificationEmail", {
    email: user.email,
    token: verificationToken,
  });

  res.status(CREATED).json({
    success: true,
    message: "Registration successful. Please verify your email.",
    data: user,
  });
};

export const verifyEmailController = async (req: Request, res: Response) => {
  const { token } = req.body;
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

  const result = await loginUser(email, password, userAgent, ipAddress);

  // If MFA is enabled, return the temp token so the client
  // can complete the challenge at POST /auth/mfa/challenge
  if (result.mfaRequired) {
    return res.status(OK).json({
      success: true,
      message: "MFA verification required",
      data: { mfaRequired: true, tempToken: result.tempToken },
    });
  }

  // Standard login — no MFA
  const { accessToken, refreshToken } = result;

  // Set refresh token in secure httpOnly cookie — never expose it to JS
  res.cookie("refreshToken", refreshToken, refreshTokenCookieOptions);

  return res.status(OK).json({
    success: true,
    message: "Login successful",
    data: { mfaRequired: false, accessToken },
  });
};

export const meController = async (req: Request, res: Response) => {
  requireAuth(req);
  const user = await getMe(req.user.userId);

  return res.status(OK).json({
    success: true,
    data: user,
  });
};

export const refreshController = async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    return res.status(UNAUTHORIZED).json({
      success: false,
      message: "Refresh token is required",
    });
  }

  const { accessToken, refreshToken: newRefreshToken } = await refreshSession(
    refreshToken,
    req.headers["user-agent"],
    req.ip,
  );

  res.cookie("refreshToken", newRefreshToken, refreshTokenCookieOptions);

  return res.status(OK).json({
    success: true,
    data: { accessToken },
  });
};

export const logoutController = async (req: Request, res: Response) => {
  requireAuth(req);

  await logoutUser(req.user.sessionId);

  res.clearCookie("refreshToken", refreshTokenCookieOptions);

  return res.status(OK).json({
    success: true,
    message: "Logged out successfully",
  });
};

export const logoutAllController = async (req: Request, res: Response) => {
  requireAuth(req);

  await logoutAllSessions(req.user.userId);

  res.clearCookie("refreshToken", refreshTokenCookieOptions);

  return res.status(OK).json({
    success: true,
    message: "All sessions revoked",
  });
};

export const forgotPasswordController = async (req: Request, res: Response) => {
  const { email } = req.body;
  await forgotPassword(email);

  // Always return the same message regardless of whether the email exists.
  // This prevents email enumeration attacks.
  return res.status(OK).json({
    success: true,
    message: "If an account exists, a reset link has been sent.",
  });
};

export const resetPasswordController = async (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  const result = await resetPassword(token, newPassword);

  return res.status(OK).json({
    success: true,
    message: result.message,
  });
};

export const changePasswordController = async (req: Request, res: Response) => {
  requireAuth(req);

  const { currentPassword, newPassword } = req.body;
  await changePassword(req.user.userId, currentPassword, newPassword, req.user.sessionId);

  return res.status(OK).json({
    success: true,
    message: "Password changed successfully",
  });
};

export const deactivateAccountController = async (req: Request, res: Response) => {
  requireAuth(req);

  const { password } = req.body;
  const result = await deactivateAccount(req.user.userId, password);

  res.clearCookie("refreshToken", refreshTokenCookieOptions);

  return res.status(OK).json({
    success: true,
    message: result.message,
  });
};

export const reactivateAccountController = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const result = await reactivateAccount(email, password);

  return res.status(OK).json({
    success: true,
    message: result.message,
  });
};

export const deleteAccountController = async (req: Request, res: Response) => {
  requireAuth(req);

  const { password } = req.body;
  const result = await deleteAccount(req.user.userId, password);

  res.clearCookie("refreshToken", refreshTokenCookieOptions);

  return res.status(OK).json({
    success: true,
    message: result.message,
  });
};
