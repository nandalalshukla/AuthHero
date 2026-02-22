import app from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./config/prisma";
import { redisClient } from "./config/redis";
import { emailWorker } from "./workers/email.worker";

const PORT = env.PORT || 8080;

const server = app.listen(PORT, () => {
  logger.info({ port: PORT, env: env.NODE_ENV }, "AuthHero server started");
});

/**
 * Graceful shutdown handler.
 *
 * Why this matters:
 * - Without it, active DB connections stay open (connection pool exhaustion)
 * - Redis connections leak
 * - BullMQ workers may lose in-progress jobs
 * - Load balancers need time to stop sending traffic
 *
 * The process:
 * 1. Stop accepting new HTTP connections
 * 2. Close the email worker (finishes current job)
 * 3. Disconnect Redis
 * 4. Disconnect Prisma/PostgreSQL
 * 5. Exit cleanly
 */
const shutdown = async (signal: string) => {
  logger.info({ signal }, "Shutting down gracefully...");

  server.close(() => {
    logger.info("HTTP server closed");
  });

  try {
    await emailWorker.close();
    await redisClient.quit();
    await prisma.$disconnect();
    logger.info("All connections closed");
  } catch (err) {
    logger.error({ err }, "Error during shutdown");
  }

  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
