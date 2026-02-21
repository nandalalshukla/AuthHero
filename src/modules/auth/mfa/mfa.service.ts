import prisma from "../../config/prisma";
import {
  generateTOTPSecret,
  generateOTPAuthURL,
  generateQRCode,
  verifyTOTP,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
} from "./mfa.crypto";
import { MFANotInitializedError, MFATokenInvalidError } from "./mfa.errors";

export class MFAService {
  async initiate(userId: string, email: string) {
    const secret = generateTOTPSecret();
    const otpauth = generateOTPAuthURL(email, secret);
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

    if (!record) throw new MFANotInitializedError();

    const valid = verifyTOTP(token, record.secretHash);
    if (!valid) throw new MFATokenInvalidError();

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

    if (!record || !record.verified) throw new MFANotInitializedError();

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

    throw new MFATokenInvalidError();
  }
}
