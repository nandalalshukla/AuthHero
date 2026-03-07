import { Router } from "express";
import {
  registerController,
  loginController,
  verifyEmailController,
  resetPasswordController,
  forgotPasswordController,
  changePasswordController,
  logoutAllController,
  logoutController,
  refreshController,
  meController,
  deactivateAccountController,
  reactivateAccountController,
  deleteAccountController,
} from "./auth.controller";
import { asyncHandler } from "../../lib/asyncHandler";
import { validate } from "../../middlewares/validate.middleware";
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resetPasswordSchema,
  forgotPasswordSchema,
  changePasswordSchema,
  deactivateAccountSchema,
  deleteAccountSchema,
  reactivateAccountSchema,
} from "./auth.validation";
import {
  loginRateLimiter,
  registerRateLimiter,
  verifyEmailRateLimiter,
  forgotPasswordRateLimiter,
  resetPasswordRateLimiter,
  refreshRateLimiter,
  changePasswordRateLimiter,
  deactivateRateLimiter,
  reactivateRateLimiter,
  deleteAccountRateLimiter,
} from "../../middlewares/rateLimiter.middleware";
import { authenticate } from "../../middlewares/auth.middleware";

const router = Router();

router.post(
  "/register",
  registerRateLimiter,
  validate(registerSchema),
  asyncHandler(registerController),
);

router.post(
  "/login",
  loginRateLimiter,
  validate(loginSchema),
  asyncHandler(loginController),
);

router.get("/me", authenticate, asyncHandler(meController));

router.post(
  "/forgot-password",
  forgotPasswordRateLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(forgotPasswordController),
);

router.post(
  "/reset-password",
  resetPasswordRateLimiter,
  validate(resetPasswordSchema),
  asyncHandler(resetPasswordController),
);

router.post("/refresh-token", refreshRateLimiter, asyncHandler(refreshController));

router.post(
  "/verify-email",
  verifyEmailRateLimiter,
  validate(verifyEmailSchema),
  asyncHandler(verifyEmailController),
);

router.post("/logout", authenticate, asyncHandler(logoutController));
router.post("/logout-all", authenticate, asyncHandler(logoutAllController));
router.post(
  "/change-password",
  authenticate,
  changePasswordRateLimiter,
  validate(changePasswordSchema),
  asyncHandler(changePasswordController),
);

router.post(
  "/deactivate",
  authenticate,
  deactivateRateLimiter,
  validate(deactivateAccountSchema),
  asyncHandler(deactivateAccountController),
);

router.post(
  "/reactivate",
  reactivateRateLimiter,
  validate(reactivateAccountSchema),
  asyncHandler(reactivateAccountController),
);

router.post(
  "/delete-account",
  authenticate,
  deleteAccountRateLimiter,
  validate(deleteAccountSchema),
  asyncHandler(deleteAccountController),
);

export default router;
