import { z } from "zod";

/**
 * Reusable password schema with strong requirements.
 * - Minimum 8 characters (NIST recommends 8+)
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character
 * - Maximum 128 chars (prevents DoS with argon2 on extremely long inputs)
 */
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one digit")
  .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character");

export const registerSchema = z.object({
  fullname: z.string().min(1, "Full name is required").trim(),
  email: z.string().email("Invalid email format").toLowerCase().trim(),
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email("Invalid email format").toLowerCase().trim(),
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Token is required"),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email format").toLowerCase().trim(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").optional(),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const deactivateAccountSchema = z.object({
  password: z.string().min(1, "Password is required to confirm deactivation").optional(),
});
export type DeactivateAccountInput = z.infer<typeof deactivateAccountSchema>;

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required to confirm deletion").optional(),
  confirmation: z.literal("DELETE MY ACCOUNT", {
    message: 'You must type "DELETE MY ACCOUNT" to confirm',
  }),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

export const reactivateAccountSchema = z.object({
  email: z.string().email("Invalid email format").toLowerCase().trim(),
  password: z.string().min(1, "Password is required"),
});
export type ReactivateAccountInput = z.infer<typeof reactivateAccountSchema>;
