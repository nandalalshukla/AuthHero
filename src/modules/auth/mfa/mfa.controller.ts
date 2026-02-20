import type { Request, Response } from "express";
import { MFAService } from "./mfa.service";

export class MFAController {
  static async setup(req: Request, res: Response) {
    // In a real app, userId comes from the authenticated session (req.user)
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { qrCodeUrl, backupCodes } = await MFAService.generateSetup(
      req.user.id,
      req.user.email,
    );
    return res.json({ qrCodeUrl, backupCodes });
  }

  static async activate(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const { code } = req.body;
    const success = await MFAService.verifyAndEnable(req.user.id, code);

    if (!success) {
      return res.status(400).json({ message: "Invalid MFA code" });
    }

    return res.json({ message: "MFA enabled successfully" });
  }
}
