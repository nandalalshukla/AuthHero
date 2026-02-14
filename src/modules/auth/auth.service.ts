import { prisma } from "../../lib/prisma";
import crypto from "crypto";
import { addDays, addMinutes } from "date-fns";
import { hashPassword, verifyPassword } from "../../lib/hash";
import { AppError } from "../../lib/AppError";
import { CONFLICT, UNAUTHORIZED } from "../../lib/http";
import { env } from "../../config/env";
import { sendEmail } from "../../utils/email";
import { generateAccessToken } from "../../config/jwt";


export const registerUser = async (email: string, password: string) => {
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
  }
};

export const sendVerificationEmail = async (email: string, token: string) => {
  const verificationUrl = `${env.APP_URL}/verify-email?token=${token}`;
  console.log(`Verification URL: ${verificationUrl}`);
  await sendEmail(email, "Verify Your Email", `
    <p>Welcome to AuthHero! Please verify your email by clicking the link below:</p>
    <a href="${verificationUrl}" style="display:inline-block;padding:10px 20px;background-color:#4F46E5;color:#fff;text-decoration:none;border-radius:4px;">Verify Email</a>
    <p>This link will expire in 10 minutes.</p>
  `);
};

export const loginUser = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw new AppError(UNAUTHORIZED, "Invalid credentials");
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    throw new AppError(UNAUTHORIZED, "Invalid credentials");
  }

  if (!user.emailVerified) {
    throw new AppError(UNAUTHORIZED, "Please verify your email first");
  }

  const refreshToken = crypto.randomBytes(40).toString("hex");
  const refreshTokenHash = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");

  const accessToken = generateAccessToken(user.id);

  await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash,
      expiresAt: addDays(new Date(), 30),
    },
  });

  return {
    accessToken,
    refreshToken,
  };
};

