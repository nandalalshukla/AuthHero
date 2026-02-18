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
} from "./auth.validation";
import {
  loginRateLimiter,
  registerRateLimiter,
  verifyEmailRateLimiter,
  forgotPasswordRateLimiter,
  resetPasswordRateLimiter,
  refreshRateLimiter,
} from "../../middlewares/rateLimiter.middleware";
import { requireAuth } from "../../utils/requireAuth";

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

router.post(
  "/refresh-token",
  refreshRateLimiter,
  asyncHandler(refreshController),
);

router.post(
  "/verify-email",
  verifyEmailRateLimiter,
  validate(verifyEmailSchema),
  asyncHandler(verifyEmailController),
);

router.post("/logout", requireAuth, asyncHandler(logoutController));
router.post("/logout-all", requireAuth, asyncHandler(logoutAllController));
router.post(
  "/change-password",
  requireAuth,
  validate(changePasswordSchema),
  asyncHandler(changePasswordController),
);
