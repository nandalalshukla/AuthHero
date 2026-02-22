import { Router } from "express";
import { initiateMFA, verifyMFA, challengeMFA } from "./mfa.controller";
import { validate } from "../../../middlewares/validate.middleware";
import { verifyMFASchema, challengeMFASchema } from "./mfa.validation";
import { asyncHandler } from "../../../lib/asyncHandler";
import { authenticate } from "../../../middlewares/auth.middleware";

const router = Router();

// Setup & verify require an authenticated user
router.post("/setup", authenticate, asyncHandler(initiateMFA));
router.post("/verify", authenticate, validate(verifyMFASchema), asyncHandler(verifyMFA));

// Challenge is used during login (user not fully authenticated yet)
router.post("/challenge", validate(challengeMFASchema), asyncHandler(challengeMFA));

export default router;
