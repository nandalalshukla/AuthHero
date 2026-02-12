import { Router } from "express";
import {register, login} from "./auth.controller";
import { asyncHandler } from "./asyncHandler";

const router = Router();

router.post("/register", asyncHandler(register));
router.post("/login", asyncHandler(login));

export default router;
