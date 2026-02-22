import pino from "pino";

/**
 * Structured logger using Pino.
 *
 * Why structured logging matters for an auth system:
 * - JSON logs are parseable by log aggregators (Datadog, CloudWatch, ELK)
 * - Each log entry has a timestamp, level, and contextual data
 * - In production, you can search for specific user IDs, session IDs, etc.
 * - In development, pino-pretty makes them human-readable
 *
 * Usage:
 *   logger.info({ userId, action: "login" }, "User logged in");
 *   logger.warn({ userId, sessionId }, "Refresh token reuse detected");
 *   logger.error({ err }, "Failed to send email");
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport:
    process.env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});
