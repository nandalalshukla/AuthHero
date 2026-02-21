import { z } from "zod";

export const verifyMFASchema = z.object({
  token: z.string().length(6),
});

export const challengeMFASchema = z.object({
  tempToken: z.string(),
  code: z.string().min(6),
});
