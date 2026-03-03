import { prisma } from "../../config/prisma";
import { logger } from "../../lib/logger";
import { addDays, addMinutes } from "date-fns";
import { hashPassword, verifyPassword } from "../../utils/hash";
import { AppError, AppErrorCode } from "../../lib/AppError";
import {
  CONFLICT,
  UNAUTHORIZED,
  BAD_REQUEST,
  FORBIDDEN,
  NOT_FOUND,
} from "../../config/http";
import { env } from "../../config/env";
import { sendEmail } from "../../utils/email";
import {
  generateAccessToken,
  generateRandomToken,
  generateMFATempToken,
  hashRandomToken,
} from "../../config/jwt";
import { createSession } from "../../lib/session";
import { TOKEN_LENGTH, TOKEN_EXPIRY } from "../../config/constants";
import type {
  LoginResponse,
  LoginMFAResponse,
  RegisterResponse,
  RefreshResponse,
} from "./auth.types";

// Pre-compute a dummy argon2 hash for timing-attack protection.
// When a user doesn't exist, we still run argon2.verify() against this
// hash so the response time is indistinguishable from a real user lookup.
// Uses lazy initialization to guarantee the hash is ready before first use.
let dummyHash: string | null = null;
const getDummyHash = async (): Promise<string> => {
  if (!dummyHash) {
    dummyHash = await hashPassword("authhero-timing-safe-dummy-password");
  }
  return dummyHash;
};

export const registerUser = async (
  fullname: string,
  email: string,
  password: string,
): Promise<RegisterResponse> => {
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new AppError(CONFLICT, "User already exists", AppErrorCode.EmailAlreadyExists);
  }

  const passwordHash = await hashPassword(password);

  const rawToken = generateRandomToken(TOKEN_LENGTH.VERIFICATION);
  const tokenHash = hashRandomToken(rawToken);
  const expiresAt = addMinutes(new Date(), TOKEN_EXPIRY.EMAIL_VERIFICATION_MINUTES);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { fullname, email, passwordHash },
      select: {
        id: true,
        fullname: true,
        email: true,
        createdAt: true,
        emailVerified: true,
        mfaEnabled: true,
      },
    });
    await tx.emailVerification.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });
    return user;
  });

  return {
    user: result,
    verificationToken: rawToken,
  };
};

// ─── Email template helpers ────────────────────────────────────────────
// Centralized templates so changes apply everywhere.

function buildVerificationEmailHtml(verificationUrl: string): string {
  return `
    <p>Welcome to AuthHero! Please verify your email by clicking the link below:</p>
    <a href="${verificationUrl}" style="display:inline-block;padding:10px 20px;background-color:#4F46E5;color:#fff;text-decoration:none;border-radius:4px;">Verify Email</a>
    <p>This link will expire in 10 minutes.</p>
  `;
}

function buildFrontendUrl(path: string): string {
  const base = env.FRONTEND_URL || env.APP_URL;
  return `${base}${path}`;
}

export const sendVerificationEmail = async (email: string, token: string) => {
  const verificationUrl = buildFrontendUrl(`/verify-email?token=${token}`);
  logger.debug({ email }, "Sending verification email");
  await sendEmail(
    email,
    "Verify Your Email",
    buildVerificationEmailHtml(verificationUrl),
  );
};

export const resendVerificationEmail = async (userId: string, email: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true },
  });

  if (!user || user.emailVerified) {
    return; // silently exit
  }

  await prisma.emailVerification.deleteMany({
    where: { userId },
  });

  const rawToken = generateRandomToken(TOKEN_LENGTH.VERIFICATION);
  const tokenHash = hashRandomToken(rawToken);
  const expiresAt = addMinutes(new Date(), TOKEN_EXPIRY.EMAIL_VERIFICATION_MINUTES);

  await prisma.emailVerification.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  const verificationUrl = buildFrontendUrl(`/verify-email?token=${rawToken}`);
  await sendEmail(
    email,
    "Verify Your Email",
    buildVerificationEmailHtml(verificationUrl),
  );
};

export const verifyEmail = async (token: string) => {
  const tokenHash = hashRandomToken(token);
  const record = await prisma.emailVerification.findFirst({
    where: {
      tokenHash,
    },
    include: {
      user: true,
    },
  });

  if (!record) {
    throw new AppError(BAD_REQUEST, "Invalid or expired token");
  }

  if (record.expiresAt < new Date()) {
    throw new AppError(BAD_REQUEST, "Token has expired");
  }

  if (record.usedAt) {
    throw new AppError(BAD_REQUEST, "Token has already been used");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: true },
    }),
    prisma.emailVerification.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);
  return { message: "Email verified successfully" };
};

export const loginUser = async (
  email: string,
  password: string,
  userAgent?: string,
  ipAddress?: string,
): Promise<LoginResponse | LoginMFAResponse> => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      emailVerified: true,
      mfaEnabled: true,
      deactivatedAt: true,
      deletedAt: true,
    },
  });

  // TIMING ATTACK PROTECTION:
  // Always perform a password hash verification, even when the user doesn't exist,
  // to ensure consistent response times. This prevents attackers from measuring
  // response times to enumerate valid accounts.

  // Use dummyHash if user doesn't exist OR if user is OAuth-only (no password set).
  const hashToCompare = user?.passwordHash ?? (await getDummyHash());

  // Compare password against real hash (or dummy). Ensures consistent timing.
  const isValid = await verifyPassword(password, hashToCompare);

  if (!user) {
    throw new AppError(
      UNAUTHORIZED,
      "Invalid credentials",
      AppErrorCode.InvalidCredentials,
    );
  }

  // If user has no password (OAuth-only account), reject with same error
  // to prevent account existence/type enumeration.
  if (!user.passwordHash || !isValid) {
    throw new AppError(
      UNAUTHORIZED,
      "Invalid credentials",
      AppErrorCode.InvalidCredentials,
    );
  }

  // Block deleted accounts — permanent, no way back
  if (user.deletedAt) {
    throw new AppError(
      FORBIDDEN,
      "This account has been deleted.",
      AppErrorCode.AccountDeleted,
    );
  }

  // Block deactivated accounts — user must reactivate first
  if (user.deactivatedAt) {
    throw new AppError(
      FORBIDDEN,
      "This account is deactivated. Please reactivate your account first.",
      AppErrorCode.AccountDeactivated,
    );
  }

  if (!user.emailVerified) {
    await resendVerificationEmail(user.id, email);
    throw new AppError(
      FORBIDDEN,
      "Email not verified. A new verification link has been sent.",
      AppErrorCode.EmailNotVerified,
    );
  }

  // If user has MFA enabled, issue a short-lived temp token
  // instead of a full session. The client must complete the MFA
  // challenge at POST /auth/mfa/challenge to get real tokens.
  if (user.mfaEnabled) {
    const tempToken = generateMFATempToken(user.id);
    return { mfaRequired: true, tempToken };
  }

  const { accessToken, refreshToken } = await createSession(
    user.id,
    userAgent,
    ipAddress,
  );

  return {
    mfaRequired: false,
    accessToken,
    refreshToken,
  };
};

export const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullname: true,
      email: true,
      emailVerified: true,
      mfaEnabled: true,
      createdAt: true,
    },
  });

  if (!user) {
    throw new AppError(NOT_FOUND, "User not found");
  }

  return user;
};

export const refreshSession = async (
  refreshToken: string,
  userAgent?: string,
  ipAddress?: string,
): Promise<RefreshResponse> => {
  const refreshTokenHash = hashRandomToken(refreshToken);

  const session = await prisma.session.findUnique({
    where: { refreshTokenHash },
  });

  if (!session) {
    throw new AppError(UNAUTHORIZED, "Invalid refresh token");
  }

  const now = new Date();

  if (session.revokedAt) {
    // Revoke all active sessions for user
    await prisma.session.updateMany({
      where: {
        userId: session.userId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    // SECURITY: Log token reuse — this is a potential theft indicator
    logger.warn(
      { userId: session.userId, sessionId: session.id },
      "Refresh token reuse detected — all sessions revoked",
    );

    throw new AppError(UNAUTHORIZED, "Token reuse detected. All sessions revoked.");
  }

  // Expiry check
  if (session.expiresAt < now) {
    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: now },
    });

    throw new AppError(UNAUTHORIZED, "Refresh token expired");
  }

  // Generate new refresh token
  const newRefreshToken = generateRandomToken(TOKEN_LENGTH.REFRESH);
  const newRefreshTokenHash = hashRandomToken(newRefreshToken);

  const newExpiresAt = addDays(now, TOKEN_EXPIRY.REFRESH_TOKEN_DAYS);

  // Rotate inside transaction (atomic update)
  const updatedSession = await prisma.$transaction(async (tx) => {
    return tx.session.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: newRefreshTokenHash,
        expiresAt: newExpiresAt,
        lastRotatedAt: now,
        userAgent: userAgent ?? session.userAgent,
        ipAddress: ipAddress ?? session.ipAddress,
      },
    });
  });

  // Issue new access token (same session id)
  const accessToken = generateAccessToken(updatedSession.userId, updatedSession.id);

  return {
    accessToken,
    refreshToken: newRefreshToken,
  };
};

export const logoutUser = async (sessionId: string) => {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });
  if (!session || session.revokedAt) {
    throw new AppError(UNAUTHORIZED, "Invalid session");
  }
  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
  return { message: "Logged out successfully" };
};

export const logoutAllSessions = async (userId: string) => {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return { message: "All sessions logged out successfully" };
};

export const forgotPassword = async (email: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
  });
  if (!user) {
    return; // Silently exit to prevent email enumeration
  }
  const token = generateRandomToken(TOKEN_LENGTH.VERIFICATION);
  const tokenHash = hashRandomToken(token);
  const expiresAt = addMinutes(new Date(), TOKEN_EXPIRY.PASSWORD_RESET_MINUTES);
  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });
  const resetUrl = buildFrontendUrl(`/reset-password?token=${token}`);

  // Queue the email via BullMQ instead of sending synchronously.
  // This makes response time constant regardless of whether the user exists,
  // preventing timing-based email enumeration.
  const { emailQueue } = await import("../../lib/queues/email.queue");
  await emailQueue.add("sendPasswordResetEmail", { email, resetUrl });
};

export const resetPassword = async (token: string, newPassword: string) => {
  const tokenHash = hashRandomToken(token);
  const record = await prisma.passwordReset.findFirst({
    where: { tokenHash },
    include: { user: true },
  });
  if (!record) {
    throw new AppError(BAD_REQUEST, "Invalid or expired token");
  }
  if (record.usedAt) {
    throw new AppError(BAD_REQUEST, "Token has already been used");
  }
  if (record.expiresAt < new Date()) {
    throw new AppError(BAD_REQUEST, "Token has expired");
  }
  const newPasswordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: newPasswordHash },
    }),
    prisma.passwordReset.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    // Revoke all sessions — a password reset means the account may have been
    // compromised, so we force every device to re-authenticate.
    prisma.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  return { message: "Password reset successfully" };
};

export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string,
  currentSessionId?: string,
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) {
    throw new AppError(UNAUTHORIZED, "User not found");
  }
  if (!user.passwordHash) {
    throw new AppError(
      BAD_REQUEST,
      "This account uses social login and has no password. Use your OAuth provider to sign in.",
    );
  }
  const isValid = await verifyPassword(currentPassword, user.passwordHash);
  if (!isValid) {
    throw new AppError(UNAUTHORIZED, "Current password is incorrect");
  }
  const newPasswordHash = await hashPassword(newPassword);

  // Update password and revoke all other sessions in one transaction.
  // Keep the current session alive so the user isn't logged out of the
  // device they changed their password from.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    }),
    prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(currentSessionId ? { id: { not: currentSessionId } } : {}),
      },
      data: { revokedAt: new Date() },
    }),
  ]);

  return { message: "Password changed successfully" };
};

// ─── Account Deactivation ─────────────────────────────────────────────
// Soft-deactivates the account. The user can reactivate later by logging
// in with correct credentials at the dedicated reactivation endpoint.
// All sessions are revoked immediately.

export const deactivateAccount = async (userId: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, deactivatedAt: true },
  });

  if (!user) {
    throw new AppError(NOT_FOUND, "User not found");
  }

  if (user.deactivatedAt) {
    throw new AppError(BAD_REQUEST, "Account is already deactivated");
  }

  // OAuth-only users don't have a password — they must set one first,
  // or we could allow them without password. For safety, we require a password.
  if (!user.passwordHash) {
    throw new AppError(
      BAD_REQUEST,
      "This account uses social login and has no password. Set a password first before deactivating.",
    );
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    throw new AppError(UNAUTHORIZED, "Incorrect password", AppErrorCode.InvalidCredentials);
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { deactivatedAt: now },
    }),
    // Revoke all sessions so the user is logged out everywhere
    prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);

  return { message: "Account deactivated successfully" };
};

// ─── Account Reactivation ─────────────────────────────────────────────
// Allows a previously deactivated user to restore their account.
// Requires correct email + password. Does NOT create a session — the
// user must log in normally after reactivation.

export const reactivateAccount = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, deactivatedAt: true, deletedAt: true },
  });

  // Timing-attack protection: always run argon2 regardless of user existence
  const hashToCompare = user?.passwordHash ?? (await getDummyHash());
  const isValid = await verifyPassword(password, hashToCompare);

  if (!user || !user.passwordHash || !isValid) {
    throw new AppError(
      UNAUTHORIZED,
      "Invalid credentials",
      AppErrorCode.InvalidCredentials,
    );
  }

  if (user.deletedAt) {
    throw new AppError(
      FORBIDDEN,
      "This account has been permanently deleted and cannot be reactivated.",
      AppErrorCode.AccountDeleted,
    );
  }

  if (!user.deactivatedAt) {
    throw new AppError(BAD_REQUEST, "Account is not deactivated");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { deactivatedAt: null },
  });

  return { message: "Account reactivated successfully. You can now log in." };
};

// ─── Account Deletion ─────────────────────────────────────────────────
// Soft-deletes the account by setting deletedAt. All sessions are revoked.
// Related data (sessions, MFA, OAuth accounts) are preserved for the
// grace period. A scheduled job can permanently purge after 30 days.

export const deleteAccount = async (userId: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, deletedAt: true },
  });

  if (!user) {
    throw new AppError(NOT_FOUND, "User not found");
  }

  if (user.deletedAt) {
    throw new AppError(BAD_REQUEST, "Account is already marked for deletion");
  }

  if (!user.passwordHash) {
    throw new AppError(
      BAD_REQUEST,
      "This account uses social login and has no password. Set a password first before deleting.",
    );
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    throw new AppError(UNAUTHORIZED, "Incorrect password", AppErrorCode.InvalidCredentials);
  }

  const now = new Date();

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { deletedAt: now, deactivatedAt: now },
    }),
    // Revoke all sessions
    prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);

  return { message: "Account deleted successfully" };
};
