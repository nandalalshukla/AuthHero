import { rateLimit, type Options } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import type { RedisReply } from "rate-limit-redis";
import { redisClient } from "../config/redis";
import { TOO_MANY_REQUESTS } from "../lib/http";

type RateLimiterConfig = {
  windowMs: number;
  max: number;
  message?: string;
  keyPrefix?: string;
};

export const createRateLimiter = ({
  windowMs,
  max,
  message = "Too many requests. Please try again later.",
  keyPrefix = "rl",
}: RateLimiterConfig) => {
  return rateLimit({
    store: new RedisStore({
      prefix: keyPrefix,
      sendCommand: async (...args: string[]) =>
        (await redisClient.sendCommand(args as any)) as RedisReply,
    }),
    keyGenerator: (req) => req.body.email ?? req.ip,

    windowMs,
    max,

    standardHeaders: true,
    legacyHeaders: false,

    handler: (req, res) => {
      res.status(TOO_MANY_REQUESTS).json({
        success: false,
        error: {
          message,
          code: "RATE_LIMIT_EXCEEDED",
        },
      });
    },
  } satisfies Partial<Options>);
};
