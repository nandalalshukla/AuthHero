import { Worker } from "bullmq";
import { redisConnection } from "../config/redis";
import { sendVerificationEmail, resendVerificationEmail } from "../modules/auth/auth.service";
import { sendEmail } from "../utils/email";
import { logger } from "../lib/logger";

export const emailWorker = new Worker(
  "emailQueue",
  async (job) => {
    switch (job.name) {
      case "sendVerificationEmail": {
        const { email, token } = job.data;
        await sendVerificationEmail(email, token);
        break;
      }
      case "resendVerificationEmail": {
        const { userId, email } = job.data;
        await resendVerificationEmail(userId, email);
        break;
      }
      case "sendPasswordResetEmail": {
        const { email, resetUrl } = job.data;
        await sendEmail(
          email,
          "Reset Your Password",
          `
          <p>You requested a password reset. Click the link below to set a new password:</p>
          <a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background-color:#4F46E5;color:#fff;text-decoration:none;border-radius:4px;">Reset Password</a>
          <p>This link will expire in 15 minutes. If you didn't request this, please ignore this email.</p>
          `,
        );
        break;
      }
      default:
        logger.warn({ jobName: job.name }, "Unknown email job type");
    }
  },
  { connection: redisConnection },
);
