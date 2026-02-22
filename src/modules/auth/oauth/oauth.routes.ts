import { Router } from "express";
import { OAuthController } from "./oauth.controller";
import { asyncHandler } from "../../../lib/asyncHandler";

const router = Router();

/**
 * GET /auth/oauth/:provider
 * Returns the OAuth authorization URL for the given provider.
 * Frontend should redirect the user to this URL.
 */
router.get("/:provider", asyncHandler(OAuthController.getAuthUrl));

/**
 * GET /auth/oauth/callback/:provider
 * This is the redirect URI you register in Google/GitHub/Facebook consoles.
 * The provider sends the user back here with a code & state.
 */
router.get("/callback/:provider", asyncHandler(OAuthController.handleCallback));

export default router;
