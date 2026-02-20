import { Router } from "express";
import { OAuthController } from "./oauth.controller";
import { validate } from "../../../middlewares/validate.middleware";
import { z } from "zod";

const router = Router();

// Schema for validating the callback
const callbackSchema = z.object({
  params: z.object({
    provider: z.enum(["google", "github", "facebook"]),
  }),
  query: z.object({
    code: z.string().min(1),
    state: z.string().min(1),
  }),
});

/**
 * GET /api/auth/callback/:provider
 * This is the URI you register in Google/GitHub/Facebook consoles
 */
router.get(
  "/callback/:provider",
  validate(callbackSchema),
  OAuthController.handleCallback,
);

export default router;
