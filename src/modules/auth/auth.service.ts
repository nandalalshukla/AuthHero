import { prisma } from "../../lib/prisma";
import { hashPassword, verifyPassword } from "../../lib/hash";
import { AppError } from "../../lib/AppError";
import { CONFLICT, UNAUTHORIZED } from "../../lib/http";

export const registerUser = async (email: string, password: string) => {
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new AppError(CONFLICT, "User already exists");
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: { email, passwordHash },
    select: {
      id: true,
      email: true,
      createdAt: true,
    },
  });

  return user;
};

export const loginUser = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new AppError(UNAUTHORIZED, "Invalid credentials");
  }

  const isValid = await verifyPassword(user.passwordHash, password);

  if (!isValid) {
    throw new AppError(UNAUTHORIZED, "Invalid credentials");
  }

  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
  };
};
