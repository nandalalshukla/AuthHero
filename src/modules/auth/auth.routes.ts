import { Router } from "express";
import {registerController, loginController, verifyEmailController} from "./auth.controller";
import { asyncHandler } from "../../lib/asyncHandler";
import { validate } from "../../middlewares/validate.middleware";
import { registerSchema, loginSchema } from "./auth.validation";
import { loginRateLimiter, registerRateLimiter } from "../../middlewares/rateLimiter.middleware";
const router = Router();
router.post("/register", registerRateLimiter, validate(registerSchema), asyncHandler(registerController));
router.post("/login",loginRateLimiter, validate(loginSchema), asyncHandler(loginController));
router.post("/verify-email", asyncHandler(verifyEmailController));


export default router;