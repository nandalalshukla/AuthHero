import { z } from "zod";

const envSchema = z.object({
  // Server
  PORT: z.string().default("5000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Database
  DATABASE_URL: z.string(),

  // JWT Secrets
  ACCESS_TOKEN_SECRET: z.string().min(10),
  REFRESH_TOKEN_SECRET: z.string().min(10),
  VERIFY_EMAIL_TOKEN_SECRET: z.string().min(10),
  FORGOT_PSWD_TOKEN_SECRET: z.string().min(10),
  RESET_PSWD_TOKEN_SECRET: z.string().min(10),

  // Email
  EMAIL_HOST: z.string().default("smtp.gmail.com"),
  EMAIL_PORT: z.coerce.number().default(465),
  EMAIL_USER: z.string().email(),
  EMAIL_PASS: z.string().min(6),

  // Frontend
  APP_URL: z.string().url().default("http://localhost:8080"),
  FRONTEND_URL: z.string().url().optional(),

  // Redis
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),

  // OAuth providers (all optional — only needed if provider is used)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),

  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_REDIRECT_URI: z.string().optional(),

  FACEBOOK_CLIENT_ID: z.string().optional(),
  FACEBOOK_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_REDIRECT_URI: z.string().optional(),

  // MFA
  MFA_ENCRYPTION_KEY: z
    .string()
    .length(64, "MFA_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)"),
  MFA_TEMP_TOKEN_SECRET: z.string().min(10),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const fields = parsedEnv.error.flatten().fieldErrors;
  const missing = Object.entries(fields)
    .map(([key, msgs]) => `  ${key}: ${msgs?.join(", ")}`)
    .join("\n");
  throw new Error(`AuthHero — invalid environment variables:\n${missing}`);
}

export const env = parsedEnv.data;
