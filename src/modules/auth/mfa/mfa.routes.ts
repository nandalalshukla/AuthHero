import { Router } from "express";
import { MFAController } from "./mfa.controller";
import { authenticate } from "../../../middlewares/auth.middleware"; // Your existing auth guard

const router = Router();

// These require a logged-in session to setup/activate
router.get("/setup", authenticate, MFAController.setup);
router.post("/activate", authenticate, MFAController.activate);

export default router;
