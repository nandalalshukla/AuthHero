import { prisma } from "../../lib/prisma";
import crypto from "crypto";
import { addDays, addMinutes } from "date-fns";
import { hashPassword, verifyPassword } from "../../lib/hash";
import { AppError } from "../../lib/AppError";
import { CONFLICT, UNAUTHORIZED, BAD_REQUEST, FORBIDDEN } from "../../lib/http";
import { env } from "../../config/env";
import { sendEmail } from "../../utils/email";
import { generateAccessToken } from "../../config/jwt";
import type { loginResponse, registerResponse } from "./auth.types";
import { getDefaultAutoSelectFamilyAttemptTimeout } from "net";

export const registerUser = async (email: string, password: string): Promise<registerResponse> => {
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new AppError(CONFLICT, "User already exists");
  }

  const passwordHash = await hashPassword(password);

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
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

export const verifyEmail = async (token: string) => {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
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


  const dummyHash = "$2b$10$CjwKCAjw8ZCkBhBPEiwA7iYz0pQYqXlTjHqgN1t9iJHqkH6GQ5K"; // Hash for "password123"
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
    throw new AppError(FORBIDDEN, "Please verify your email first");
  }

  const refreshToken = crypto.randomBytes(40).toString("hex");
  const refreshTokenHash = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");

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

