import { z } from "zod";

export const verifyMFASchema = z.object({
  token: z.string().length(6),
});

export const challengeMFASchema = z.object({
  tempToken: z.string().min(1, "Temp token is required"),
  code: z.string().min(6, "Code must be at least 6 characters"),
});

export const disableMFASchema = z.object({
  code: z
    .string()
    .length(6, "Enter the 6-digit code from your authenticator app"),
});
