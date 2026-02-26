import nodemailer from "nodemailer";
import { env } from "./env";
import { logger } from "../lib/logger";

// Create email transporter using Gmail SMTP
export const transporter = nodemailer.createTransport({
  host: env.EMAIL_HOST,
  port: env.EMAIL_PORT,
  secure: true, //Use SSL
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASS,
  },
  // In production, always validate TLS certificates.
  // Set EMAIL_TLS_REJECT_UNAUTHORIZED=false only if you use a self-signed cert in dev.
  tls: {
    rejectUnauthorized: process.env.EMAIL_TLS_REJECT_UNAUTHORIZED !== "false",
  },
  from: {
    name: "AuthHero",
    address: env.EMAIL_USER,
  },
});

// Verify transporter configuration on startup
transporter.verify((error, _success) => {
  if (error) {
    logger.error({ err: error }, "Email transporter configuration error");
  } else {
    logger.info("Email transporter is ready");
  }
});
