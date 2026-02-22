import { prisma } from "../../../config/prisma";
import {
  generateTOTPSecret,
  generateOTPAuthURL,
  generateQRCode,
  verifyTOTP,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
} from "./mfa.crypto";
import { AppError } from "../../../lib/AppError";
import { BAD_REQUEST } from "../../../config/http";

export class MFAService {
  async initiate(userId: string) {
    // Fetch email from DB since it's not in the access token
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) throw new AppError(BAD_REQUEST, "User not found");

    const secret = generateTOTPSecret();
    const otpauth = generateOTPAuthURL(user.email, secret);
    const qrCode = await generateQRCode(otpauth);

    const backupCodes = generateBackupCodes();
    const hashedCodes = await Promise.all(backupCodes.map(hashBackupCode));

    await prisma.mFASecret.upsert({
      where: { userId },
      update: {
        secretHash: secret,
        backupCodes: hashedCodes,
        verified: false,
      },
      create: {
        userId,
        secretHash: secret,
        backupCodes: hashedCodes,
      },
    });

    return { qrCode, backupCodes };
  }

  async verifyAndEnable(userId: string, token: string) {
    const record = await prisma.mFASecret.findUnique({
      where: { userId },
    });

    if (!record) throw new AppError(BAD_REQUEST, "MFA has not been set up");

    const valid = verifyTOTP(token, record.secretHash);
    if (!valid) throw new AppError(BAD_REQUEST, "Invalid MFA token");

    await prisma.mFASecret.update({
      where: { userId },
      data: {
        verified: true,
        enabledAt: new Date(),
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });

    return true;
  }

  async verifyChallenge(userId: string, code: string) {
    const record = await prisma.mFASecret.findUnique({
      where: { userId },
    });

    if (!record || !record.verified) throw new AppError(BAD_REQUEST, "MFA has not been set up");

    if (verifyTOTP(code, record.secretHash)) {
      return true;
    }

    for (const hash of record.backupCodes) {
      if (await verifyBackupCode(code, hash)) {
        await prisma.mFASecret.update({
          where: { userId },
          data: {
            backupCodes: {
              set: record.backupCodes.filter((c) => c !== hash),
            },
          },
        });
        return true;
      }
    }

    throw new AppError(BAD_REQUEST, "Invalid MFA code");
  }
}
