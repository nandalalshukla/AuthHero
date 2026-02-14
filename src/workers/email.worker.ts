import { Worker } from "bullmq";
import { redisConnection } from "../config/redis";
import { sendVerificationEmail } from "../modules/auth/auth.service";


export const emailWorker = new Worker(
  "emailQueue",
  async (job) => {
    if (job.name === "sendVerificationEmail") {
      const { email, token } = job.data;
      await sendVerificationEmail(email, token);
    }
  },
  { connection: redisConnection },
);
