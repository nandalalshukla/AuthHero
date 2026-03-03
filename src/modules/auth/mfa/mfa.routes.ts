import { Router } from "express";
import {
  initiateMFA,
  verifyMFA,
  challengeMFA,
  disableMFA,
  regenerateBackupCodes,
} from "./mfa.controller";
import { validate } from "../../../middlewares/validate.middleware";
import {
  verifyMFASchema,
  challengeMFASchema,
  disableMFASchema,
  regenerateBackupCodesSchema,
} from "./mfa.validation";
import { asyncHandler } from "../../../lib/asyncHandler";
import { authenticate } from "../../../middlewares/auth.middleware";
import { mfaChallengeRateLimiter } from "../../../middlewares/rateLimiter.middleware";

const router = Router();

// Setup & verify require an authenticated user
router.post("/setup", authenticate, asyncHandler(initiateMFA));
router.post("/verify", authenticate, validate(verifyMFASchema), asyncHandler(verifyMFA));

// Challenge is used during login (user not fully authenticated yet)
// Rate-limited to prevent brute-force of 6-digit TOTP codes
router.post(
  "/challenge",
  mfaChallengeRateLimiter,
  validate(challengeMFASchema),
  asyncHandler(challengeMFA),
);

// Disable requires authentication + current TOTP code for confirmation
router.post(
  "/disable",
  authenticate,
  validate(disableMFASchema),
  asyncHandler(disableMFA),
);

// Regenerate backup codes requires authentication + current TOTP code
router.post(
  "/regenerate-backup-codes",
  authenticate,
  validate(regenerateBackupCodesSchema),
  asyncHandler(regenerateBackupCodes),
);

export default router;
