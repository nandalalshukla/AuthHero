import { authenticator } from "otplib";
import crypto from "crypto";
import prisma from "../../../lib/prisma"; // Adjust path to your prisma client

const ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY!; // 32 bytes
const IV_LENGTH = 16;

export class MFAService {
  // Encrypt secret before storing in DB
  private static encryptSecret(secret: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      Buffer.from(ENCRYPTION_KEY),
      iv,
    );
    let encrypted = cipher.update(secret);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString("hex") + ":" + encrypted.toString("hex");
  }

  private static decryptSecret(encryptedData: string): string {
    const [ivHex, encryptedHex] = encryptedData.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const encryptedText = Buffer.from(encryptedHex, "hex");
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(ENCRYPTION_KEY),
      iv,
    );
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  }

  static async generateSetupData(userId: string, email: string) {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(email, "YourAppName", secret);

    // Store temporarily or update pending secret
    const encrypted = this.encryptSecret(secret);
    await prisma.mfaSecret.upsert({
      where: { userId },
      update: { secret: encrypted },
      create: { userId, secret: encrypted },
    });

    return { secret, otpauth };
  }

  static async verifyAndEnable(userId: string, token: string) {
    const mfa = await prisma.mfaSecret.findUnique({ where: { userId } });
    if (!mfa) throw new Error("MFA not initiated");

    const isValid = authenticator.check(token, this.decryptSecret(mfa.secret));
    if (!isValid) return false;

    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });
    return true;
  }
}
