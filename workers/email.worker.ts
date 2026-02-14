import { Worker } from "bullmq";
import { redisConnection } from "../src/config/redis";
import { verifyEmail } from "../src/modules/auth/auth.service";


export const emailWorker = new Worker(
  "emailQueue",
  async (job) => {
    if (job.name === "verifyEmail") {
      const { email, token } = job.data;
      await verifyEmail(email, token);
    }
  },
  { connection: redisConnection },
);
