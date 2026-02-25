import { prisma } from "../../config/prisma";
import crypto from "crypto";
import { logger } from "../../config/logger";
import { addDays, addMinutes } from "date-fns";
import { hashPassword, verifyPassword } from "../../utils/hash";
import { AppError, AppErrorCode } from "../../lib/AppError";
import { CONFLICT, UNAUTHORIZED, BAD_REQUEST, FORBIDDEN } from "../../config/http";
import { env } from "../../config/env";
import { sendEmail } from "../../utils/email";
import {
  generateAccessToken,
  generateRandomToken,
  generateMFATempToken,
  hashRandomToken,
} from "../../config/jwt";
import type {
  loginResponse,
  loginMFAResponse,
  registerResponse,
  refreshResponse,
} from "./auth.types";

// Pre-compute a dummy argon2 hash at module load time.
// This is used for timing-attack protection: when a user doesn't exist,
//we still run argon2.verify() against this hash so the response time
//is indistinguishable from a real user lookup.
let dummyHash: string;
hashPassword("authhero-timing-safe-dummy-password").then((h) => {
  dummyHash = h;
});

export const registerUser = async (
  email: string,
  password: string,
): Promise<registerResponse> => {
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new AppError(CONFLICT, "User already exists", AppErrorCode.EmailAlreadyExists);
  }

  const passwordHash = await hashPassword(password);

  const rawToken = generateRandomToken(36);
  const tokenHash = hashRandomToken(rawToken);
  const expiresAt = addMinutes(new Date(), 10);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, passwordHash },
      select: {
        id: true,
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

export const sendVerificationEmail = async (email: string, token: string) => {
  const verificationUrl = `${env.APP_URL}/verify-email?token=${token}`;
  logger.debug({ email }, "Sending verification email");
  await sendEmail(
    email,
    "Verify Your Email",
    `
    <p>Welcome to AuthHero! Please verify your email by clicking the link below:</p>
    <a href="${verificationUrl}" style="display:inline-block;padding:10px 20px;background-color:#4F46E5;color:#fff;text-decoration:none;border-radius:4px;">Verify Email</a>
    <p>This link will expire in 10 minutes.</p>
  `,
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

  const rawToken = generateRandomToken(36);
  const tokenHash = hashRandomToken(rawToken);
  const expiresAt = addMinutes(new Date(), 15);

  await prisma.emailVerification.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  const verificationUrl = `${env.APP_URL}/verify-email?token=${rawToken}`;

  await sendEmail(
    email,
    "Verify Your Email",
    `
    <p>Welcome to AuthHero! Please verify your email by clicking the link below:</p>
    <a href="${verificationUrl}" style="display:inline-block;padding:10px 20px;background-color:#4F46E5;color:#fff;text-decoration:none;border-radius:4px;">Verify Email</a>
    <p>This link will expire in 10 minutes.</p>
  `,
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
): Promise<loginResponse | loginMFAResponse> => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      emailVerified: true,
      mfaEnabled: true,
    },
  });

  //TIMING ATTACK: By always performing a password hash verification, even when the user doesn't exist, we ensure that the response time is consistent regardless of whether the email is registered. This prevents attackers from measuring response times to determine if a user exists in the system, thus mitigating a common timing attack vector.

  // Use dummyHash if user doesn't exist OR if user is OAuth-only (no password set).
  // This prevents timing-based user enumeration in both cases.
  const hashToCompare = user?.passwordHash ?? dummyHash;

  // Compare password against real hash (or dummy if user not found / OAuth-only). This ensures consistent timing.
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

  const refreshToken = generateRandomToken(40);
  const refreshTokenHash = hashRandomToken(refreshToken);

  const refreshTokenExpiresAt = addDays(new Date(), 30);
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash,
      expiresAt: refreshTokenExpiresAt,
      userAgent,
      ipAddress,
    },
  });
  const accessToken = generateAccessToken(user.id, session.id);
  return {
    mfaRequired: false,
    accessToken,
    refreshToken,
  };
};

export const refreshSession = async (
  refreshToken: string,
  userAgent?: string,
  ipAddress?: string,
): Promise<refreshResponse> => {
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

  // 3️⃣ Expiry check
  if (session.expiresAt < now) {
    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: now },
    });

    throw new AppError(UNAUTHORIZED, "Refresh token expired");
  }

  // 4️⃣ Generate new refresh token
  const newRefreshToken = generateRandomToken(40);
  const newRefreshTokenHash = hashRandomToken(newRefreshToken);

  const newExpiresAt = addDays(now, 30);

  // 5️⃣ Rotate inside transaction (atomic update)
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

  // 6️⃣ Issue new access token (same session id)
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
  const token = generateRandomToken(36);
  const tokenHash = hashRandomToken(token);
  const expiresAt = addMinutes(new Date(), 15);
  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });
  const resetUrl = `${env.APP_URL}/reset-password?token=${token}`;
  await sendEmail(
    email,
    "Reset Your Password",
    `
    <p>You requested a password reset. Click the link below to set a new password:</p>
    <a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background-color:#4F46E5;color:#fff;text-decoration:none;border-radius:4px;">Reset Password</a>
    <p>This link will expire in 15 minutes. If you didn't request this, please ignore this email.</p>
  `,
  );
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
  ]);
  return { message: "Password reset successfully" };
};

export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string,
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
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newPasswordHash },
  });
  return { message: "Password changed successfully" };
};
