import { createRateLimiter } from "../utils/rateLimiter";

export const loginRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: "Too many login attempts. Please try again in 1 minute.",
  keyPrefix: "login_rl",
});

export const registerRateLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 3,
  message: "Too many registration attempts.",
  keyPrefix: "register_rl",
});

export const verifyEmailRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: "Too many verification attempts. Please try again in 1 minute.",
  keyPrefix: "verify_email_rl",
});

export const forgotPasswordRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: "Too many password reset attempts. Please try again in 1 minute.",
  keyPrefix: "forgot_password_rl",
});

export const resetPasswordRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: "Too many password reset attempts. Please try again in 1 minute.",
  keyPrefix: "reset_password_rl",
});

export const refreshRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: "Too many token refresh attempts. Please try again in 1 minute.",
  keyPrefix: "refresh_token_rl",
});

export const mfaChallengeRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: "Too many MFA attempts. Please try again in 1 minute.",
  keyPrefix: "mfa_challenge_rl",
});

export const changePasswordRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: "Too many password change attempts. Please try again in 1 minute.",
  keyPrefix: "change_password_rl",
});
