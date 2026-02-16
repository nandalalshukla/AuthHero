import { RedisStore, type RedisReply } from "rate-limit-redis";
import { redisClient } from "../config/redis";
import { rateLimit } from "express-rate-limit";

export const loginRateLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (command: string[]) => redisClient.sendCommand(command as any),
  }),

  windowMs: 60 * 1000,
  max: 5,

  standardHeaders: true,
  legacyHeaders: false,

  message: {
    error: "Too many login attempts. Please try again later.",
  },
});
