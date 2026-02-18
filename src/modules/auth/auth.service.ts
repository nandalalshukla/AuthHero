import { prisma } from "../../config/prisma";
import crypto, { hash } from "crypto";
import { addDays, addMinutes } from "date-fns";
import { hashPassword, verifyPassword } from "../../utils/hash";
import { AppError } from "../../lib/AppError";
import {
  CONFLICT,
  UNAUTHORIZED,
  BAD_REQUEST,
  FORBIDDEN,
} from "../../config/http";
import { env } from "../../config/env";
import { sendEmail } from "../../utils/email";
import {
  generateAccessToken,
  generateRandomToken,
  hashRandomToken,
} from "../../config/jwt";
import type {
  loginResponse,
  registerResponse,
  refreshResponse,
} from "./auth.types";

export const registerUser = async (
  email: string,
  password: string,
): Promise<registerResponse> => {
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new AppError(CONFLICT, "User already exists");
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
  console.log(`Verification URL: ${verificationUrl}`);
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

export const resendVerificationEmail = async (
  userId: string,
  email: string,
) => {
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
): Promise<loginResponse> => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      emailVerified: true,
    },
  });

  const dummyHash =
    "$2b$10$CjwKCAjw8ZCkBhBPEiwA7iYz0pQYqXlTjHqgN1t9iJHqkH6GQ5K"; // Hash for "password123"
  const hashToCompare = user?.passwordHash || dummyHash;
  //comparing the password with the dummyHash if user is not found to prevent timing attacks that can reveal if a user exists or not based on response time something valuable that i learned by browsing various repos and articles about security best practices in authentication systems nice real world practice.
  const isValid = await verifyPassword(password, hashToCompare);

  if (!user) {
    throw new AppError(UNAUTHORIZED, "Invalid credentials");
  }
  if (!isValid) {
    throw new AppError(UNAUTHORIZED, "Invalid credentials");
  }

  if (!user.emailVerified) {
    await resendVerificationEmail(user.id, email);
    throw new AppError(
      FORBIDDEN,
      "Email not verified. A new verification link has been sent.",
    );
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

  // 1️⃣ Invalid token
  if (!session) {
    throw new AppError(UNAUTHORIZED, "Invalid refresh token");
  }

  const now = new Date();

  // 2️⃣ Reuse detection (revoked token used again)
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

    // (Optional) Log security event
    console.warn(`Refresh token reuse detected for user ${session.userId}`);

    throw new AppError(
      UNAUTHORIZED,
      "Token reuse detected. All sessions revoked.",
    );
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
  const accessToken = generateAccessToken(
    updatedSession.userId,
    updatedSession.id,
  );

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

