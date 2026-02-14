import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default("5000"),
  ACCESS_TOKEN_SECRET: z.string().min(10),
  REFRESH_TOKEN_SECRET: z.string().min(10),
  VERIFY_EMAIL_TOKEN_SECRET: z.string().min(10),
  FORGET_PSWD_TOKEN_SECRET: z.string().min(10),
  RESET_PSWD_TOKEN_SECRET: z.string().min(10),
    DATABASE_URL: z.string(),
    EMAIL_HOST: z.string().default("smtp.gmail.com"),
    EMAIL_PORT: z.number().default(465),
    EMAIL_USER: z.string().email(),
    EMAIL_PASS: z.string().min(6),
    APP_URL: z.string().url().default("http://localhost:3000"),
    REDIS_HOST: z.string().default("localhost"),
    REDIS_PORT: z.number().default(6379),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment variables");
  console.error(parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
