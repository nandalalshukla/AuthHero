import { authenticator } from "otplib";
import crypto from "crypto";
import { prisma } from "../../../config/prisma";
import type { MFASetupResponse } from "./mfa.types";

export class MFAService {
  private static readonly ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY!; // 32 chars

  /**
   * Generates a new TOTP secret and backup codes.
   * Does NOT enable MFA yet; user must verify first.
   */
  static async generateSetup(
    userId: string,
    email: string,
  ): Promise<MFASetupResponse> {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(email, "YourApp", secret);

    // Generate 10 backup codes
    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString("hex"),
    );

    // Encrypt secret and hash backup codes before storing
    const encryptedSecret = this.encrypt(secret);
    const hashedBackupCodes = backupCodes.map((code) =>
      crypto.createHash("sha256").update(code).digest("hex"),
    );

    await prisma.mFASecret.upsert({
      where: { userId },
      update: { secret: encryptedSecret, backupCodes: hashedBackupCodes },
      create: {
        userId,
        secret: encryptedSecret,
        backupCodes: hashedBackupCodes,
      },
    });

    return { qrCodeUrl: otpauth, secret, backupCodes };
  }

  /**
   * Verifies the 6-digit code and permanently enables MFA for the user.
   */
  static async verifyAndEnable(userId: string, code: string): Promise<boolean> {
    const mfa = await prisma.mFASecret.findUnique({ where: { userId } });
    if (!mfa) return false;

    const decryptedSecret = this.decrypt(mfa.secret);
    const isValid = authenticator.verify({
      token: code,
      secret: decryptedSecret,
    });

    if (isValid) {
      await prisma.user.update({
        where: { id: userId },
        data: { mfaEnabled: true },
      });
    }

    return isValid;
  }

  // Helper: Simple AES Encryption for secrets at rest
  private static encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      Buffer.from(this.ENCRYPTION_KEY),
      iv,
    );
    return (
      iv.toString("hex") +
      ":" +
      Buffer.concat([cipher.update(text), cipher.final()]).toString("hex")
    );
  }

  private static decrypt(hash: string): string {
    const [iv, encrypted] = hash.split(":");
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(this.ENCRYPTION_KEY),
      Buffer.from(iv, "hex"),
    );
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "hex")),
      decipher.final(),
    ]).toString();
  }
}
