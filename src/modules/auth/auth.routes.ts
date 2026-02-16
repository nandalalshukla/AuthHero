import { Router } from "express";
import {registerController, loginController, verifyEmailController} from "./auth.controller";
import { asyncHandler } from "./asyncHandler";
import { validate } from "../../middlewares/validate.middleware";
import { registerSchema, loginSchema } from "./auth.validation";
const router = Router();

router.post("/register", validate(registerSchema), asyncHandler(registerController));
router.post("/login", validate(loginSchema), asyncHandler(loginController));
router.post("/verify-email", asyncHandler(verifyEmailController));

export default router;
