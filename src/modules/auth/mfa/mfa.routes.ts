import { Router } from "express";
import { initiateMFA, verifyMFA, challengeMFA } from "./mfa.controller";
import { validate } from "../../middleware/validate";
import { verifyMFASchema, challengeMFASchema } from "./mfa.validation";

const router = Router();

router.post("/setup", initiateMFA);
router.post("/verify", validate(verifyMFASchema), verifyMFA);
router.post("/challenge", validate(challengeMFASchema), challengeMFA);

export default router;
