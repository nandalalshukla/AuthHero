import { Redis } from "ioredis";
import { env } from "./env";
import { logger } from "../lib/logger";

export const redisClient = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  maxRetriesPerRequest: null, // Required by BullMQ
});

redisClient.on("error", (err) => {
  logger.error({ err }, "Redis connection error");
});

redisClient.on("connect", () => {
  logger.info("Redis connected");
});

export const redisConnection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
};
