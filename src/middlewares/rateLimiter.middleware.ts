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
