import nodemailer from "nodemailer";
import {env} from "./env";
import { logger } from "./logger";

// Create email transporter using Gmail SMTP
export const transporter = nodemailer.createTransport({
  host: env.EMAIL_HOST,
  port: env.EMAIL_PORT,
  secure: true, // Use SSL
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // Allow self-signed certificates
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
