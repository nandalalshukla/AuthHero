import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import authRoutes from "./modules/auth/auth.routes";
import oauthRoutes from "./modules/auth/oauth/oauth.routes";
import mfaRoutes from "./modules/auth/mfa/mfa.routes";
import { errorMiddleware } from "./middlewares/error.middleware";
import corsConfig from "./config/cors";

const app = express();

// --- Security ---
// Trust the first proxy (e.g., Nginx, Cloudflare) so req.ip returns the real client IP
app.set("trust proxy", 1);

// --- Global Middleware ---
// These run on EVERY request, in order:
app.use(helmet()); // Security headers (CSP, X-Content-Type-Options, HSTS, etc.)
app.use(express.json({ limit: "16kb" })); // Parse JSON bodies with explicit size limit
app.use(cookieParser()); // Parse cookies (needed for refreshToken & OAuth state)
app.use(corsConfig); // CORS headers

// --- Health Check ---
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// --- Routes ---
app.use("/auth", authRoutes);
app.use("/auth/oauth", oauthRoutes);
app.use("/auth/mfa", mfaRoutes);

// --- Error Handler ---
// MUST be last — it catches errors thrown by routes above
app.use(errorMiddleware);

export default app;
