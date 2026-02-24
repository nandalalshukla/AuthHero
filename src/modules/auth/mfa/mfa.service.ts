import { prisma } from "../../../config/prisma";
import {
  generateTOTPSecret,
  generateOTPAuthURL,
  generateQRCode,
  verifyTOTP,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  encryptSecret,
} from "./mfa.crypto";
import { AppError, AppErrorCode } from "../../../lib/AppError";
import { BAD_REQUEST } from "../../../config/http";
import {
  generateAccessToken,
  generateRandomToken,
  hashRandomToken,
} from "../../../config/jwt";
import { addDays } from "date-fns";

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

    // Encrypt the TOTP secret before storing (AES-256-GCM).
    // The raw secret is only shown to the user via QR code during setup.
    const encryptedSecret = encryptSecret(secret);

    const backupCodes = generateBackupCodes();
    const hashedCodes = await Promise.all(backupCodes.map(hashBackupCode));

    await prisma.mFASecret.upsert({
      where: { userId },
      update: {
        secretHash: encryptedSecret,
        backupCodes: hashedCodes,
        verified: false,
      },
      create: {
        userId,
        secretHash: encryptedSecret,
        backupCodes: hashedCodes,
      },
    });

    return { qrCode, backupCodes };
  }

  async verifyAndEnable(userId: string, token: string) {
    const record = await prisma.mFASecret.findUnique({
      where: { userId },
    });

    if (!record)
      throw new AppError(
        BAD_REQUEST,
        "MFA has not been set up",
        AppErrorCode.MFANotSetup,
      );

    const valid = await verifyTOTP(token, record.secretHash);
    if (!valid)
      throw new AppError(BAD_REQUEST, "Invalid MFA token", AppErrorCode.MFAInvalidCode);

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

  /**
   * Verifies the MFA code (TOTP or backup) and creates a full session.
   * Called after the user passes the MFA challenge during login.
   */
  async verifyChallenge(
    userId: string,
    code: string,
    userAgent?: string,
    ipAddress?: string,
  ) {
    const record = await prisma.mFASecret.findUnique({
      where: { userId },
    });

    if (!record || !record.verified)
      throw new AppError(
        BAD_REQUEST,
        "MFA has not been set up",
        AppErrorCode.MFANotSetup,
      );

    // Try TOTP code first
    const isTOTPValid = await verifyTOTP(code, record.secretHash);

    if (!isTOTPValid) {
      // Fall back to backup codes
      let backupCodeUsed = false;

      for (const hash of record.backupCodes) {
        if (await verifyBackupCode(code, hash)) {
          // Remove the used backup code (one-time use)
          await prisma.mFASecret.update({
            where: { userId },
            data: {
              backupCodes: {
                set: record.backupCodes.filter((c) => c !== hash),
              },
            },
          });
          backupCodeUsed = true;
          break;
        }
      }

      if (!backupCodeUsed) {
        throw new AppError(BAD_REQUEST, "Invalid MFA code", AppErrorCode.MFAInvalidCode);
      }
    }

    // MFA passed — create a real session (same as normal login)
    const refreshToken = generateRandomToken(40);
    const refreshTokenHash = hashRandomToken(refreshToken);
    const refreshTokenExpiresAt = addDays(new Date(), 30);

    const session = await prisma.session.create({
      data: {
        userId,
        refreshTokenHash,
        expiresAt: refreshTokenExpiresAt,
        userAgent,
        ipAddress,
      },
    });

    const accessToken = generateAccessToken(userId, session.id);

    return { accessToken, refreshToken };
  }

  /**
   * Disables MFA for a user after verifying their current TOTP code.
   * Deletes the MFASecret record and sets mfaEnabled to false.
   */
  async disable(userId: string, code: string) {
    const record = await prisma.mFASecret.findUnique({
      where: { userId },
    });

    if (!record || !record.verified)
      throw new AppError(BAD_REQUEST, "MFA is not enabled", AppErrorCode.MFANotSetup);

    const valid = await verifyTOTP(code, record.secretHash);
    if (!valid)
      throw new AppError(
        BAD_REQUEST,
        "Invalid MFA code. Please enter the current code from your authenticator app.",
        AppErrorCode.MFAInvalidCode,
      );

    // Remove MFA in a transaction for data integrity
    await prisma.$transaction([
      prisma.mFASecret.delete({ where: { userId } }),
      prisma.user.update({
        where: { id: userId },
        data: { mfaEnabled: false },
      }),
    ]);

    return true;
  }
}
