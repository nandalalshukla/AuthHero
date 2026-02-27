import type { Express, RequestHandler, ErrorRequestHandler } from "express";
import type { Router } from "express";
import type { PrismaClient } from "./generated/prisma/client";

/**
 * What `createAuthHero()` returns.
 */
export interface AuthHero {
  /** Complete Express app — helmet, CORS, health check, all auth routes, error handler */
  app: Express;

  /** Individual route modules — mount these on your own Express app if you prefer */
  routes: {
    auth: Router;
    oauth: Router;
    mfa: Router;
  };

  /** JWT authentication middleware — protect your own routes with `app.get("/me", auth.authenticate, handler)` */
  authenticate: RequestHandler;

  /** MFA enforcement middleware — require MFA on sensitive routes */
  requireMFA: RequestHandler;

  /** Global error handler — add as the LAST middleware: `app.use(auth.errorMiddleware)` */
  errorMiddleware: ErrorRequestHandler;

  /** Prisma client — run your own database queries (e.g. `auth.prisma.user.findMany()`) */
  prisma: PrismaClient;

  /** Gracefully close all connections (database, Redis, email worker) */
  shutdown: () => Promise<void>;
}

/**
 * Initialize AuthHero.
 *
 * Set your environment variables BEFORE calling this (via `.env` + dotenv, or process.env).
 * See `.env.example` for the full list.
 *
 * @example
 * ```ts
 * import "dotenv/config";
 * import { createAuthHero } from "authhero";
 *
 * const auth = await createAuthHero();
 *
 * // Option 1: Use the full app (includes helmet, CORS, health check, error handler)
 * auth.app.listen(3000, () => console.log("AuthHero running on :3000"));
 *
 * // Option 2: Mount just the routes on your own Express app
 * myApp.use("/auth", auth.routes.auth);
 * myApp.use("/auth/oauth", auth.routes.oauth);
 * myApp.use("/auth/mfa", auth.routes.mfa);
 * myApp.use(auth.errorMiddleware);
 *
 * // Protect your own routes
 * myApp.get("/me", auth.authenticate, (req, res) => {
 *   res.json({ userId: req.user?.userId });
 * });
 *
 * // Graceful shutdown
 * process.on("SIGTERM", async () => {
 *   await auth.shutdown();
 *   process.exit(0);
 * });
 * ```
 */
export async function createAuthHero(): Promise<AuthHero> {
  // Dynamic imports — nothing runs until you call this function.
  // This is what validates your env vars & establishes DB/Redis connections.

  // Importing `app` pulls in the entire dependency tree:
  // env validation → Prisma → Redis → routes → controllers → services
  const { default: app } = await import("./app");

  // These modules are already loaded & cached from the `app` import above.
  // We just grab references to re-export them.
  const { prisma } = await import("./config/prisma");
  const { redisClient } = await import("./config/redis");
  const { emailWorker } = await import("./workers/email.worker");
  const { authenticate } = await import("./middlewares/auth.middleware");
  const { requireMFA } = await import("./middlewares/mfa.middleware");
  const { errorMiddleware } = await import("./middlewares/error.middleware");
  const { default: authRoutes } = await import("./modules/auth/auth.routes");
  const { default: oauthRoutes } = await import("./modules/auth/oauth/oauth.routes");
  const { default: mfaRoutes } = await import("./modules/auth/mfa/mfa.routes");
  const { logger } = await import("./lib/logger");

  async function shutdown() {
    logger.info("Shutting down AuthHero...");
    await emailWorker.close();
    await redisClient.quit();
    await prisma.$disconnect();
    logger.info("All connections closed");
  }

  return {
    app,
    routes: { auth: authRoutes, oauth: oauthRoutes, mfa: mfaRoutes },
    authenticate,
    requireMFA,
    errorMiddleware,
    prisma,
    shutdown,
  };
}
