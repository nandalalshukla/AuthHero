import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock dependencies ──────────────────────────────────────────────────
// Same pattern as auth-service tests. We mock the database, crypto
// utilities, and JWT functions so we can test the MFA business logic
// without real infrastructure.

vi.mock("../src/config/env", () => ({
  env: {
    MFA_ENCRYPTION_KEY:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    MFA_TEMP_TOKEN_SECRET: "test-mfa-temp-secret-min10aaaa",
    ACCESS_TOKEN_SECRET: "test-access-secret-key-minimum-10",
  },
}));

vi.mock("../src/config/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    mFASecret: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    session: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock MFA crypto utilities — return predictable values
vi.mock("../src/modules/auth/mfa/mfa.crypto", () => ({
  generateTOTPSecret: vi.fn().mockReturnValue("MOCK_TOTP_SECRET"),
  generateOTPAuthURL: vi.fn().mockReturnValue("otpauth://totp/AuthHero:test@example.com?secret=MOCK"),
  generateQRCode: vi.fn().mockResolvedValue("data:image/png;base64,mockQR"),
  verifyTOTP: vi.fn().mockResolvedValue(true),
  encryptSecret: vi.fn().mockReturnValue("encrypted-secret"),
  generateBackupCodes: vi.fn().mockReturnValue([
    "code0001", "code0002", "code0003", "code0004",
    "code0005", "code0006", "code0007", "code0008",
  ]),
  hashBackupCode: vi.fn().mockImplementation((code: string) =>
    Promise.resolve(`hashed-${code}`),
  ),
  verifyBackupCode: vi.fn().mockResolvedValue(false),
}));

vi.mock("../src/config/jwt", () => ({
  generateAccessToken: vi.fn().mockReturnValue("mock-access-token"),
  generateRandomToken: vi.fn().mockReturnValue("mock-refresh-token"),
  hashRandomToken: vi.fn().mockReturnValue("mock-hashed-refresh"),
}));

vi.mock("../src/config/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Imports ────────────────────────────────────────────────────────────
import { MFAService } from "../src/modules/auth/mfa/mfa.service";
import { prisma } from "../src/config/prisma";
import { verifyTOTP, verifyBackupCode } from "../src/modules/auth/mfa/mfa.crypto";
import { AppError } from "../src/lib/AppError";

const mockPrisma = prisma as any;
const service = new MFAService();

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("MFAService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── initiate ─────────────────────────────────────────────────────────
  // What it does:
  // 1. Fetch user email from DB
  // 2. Generate TOTP secret, QR code, backup codes
  // 3. Encrypt secret and hash backup codes
  // 4. Upsert MFASecret record (so re-initiating overwrites the old one)
  // 5. Return QR code + plaintext backup codes to show the user
  describe("initiate", () => {
    it("should generate QR code and backup codes", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        email: "test@example.com",
      });
      mockPrisma.mFASecret.upsert.mockResolvedValue({});

      const result = await service.initiate("user-1");

      // User should receive a QR code to scan and backup codes to save
      expect(result.qrCode).toContain("data:image/png");
      expect(result.backupCodes).toHaveLength(8);

      // Verify the upsert was called (create OR update)
      expect(mockPrisma.mFASecret.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1" },
        }),
      );
    });

    it("should throw if user is not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.initiate("no-user")).rejects.toThrow(
        "User not found",
      );
    });
  });

  // ─── verifyAndEnable ──────────────────────────────────────────────────
  // What it does:
  // 1. Look up the MFA secret for the user
  // 2. Verify the TOTP code against the encrypted secret
  // 3. Mark MFA as verified + enabled
  describe("verifyAndEnable", () => {
    it("should enable MFA when code is valid", async () => {
      mockPrisma.mFASecret.findUnique.mockResolvedValue({
        userId: "user-1",
        secretHash: "encrypted-secret",
        verified: false,
      });
      (verifyTOTP as any).mockResolvedValue(true);
      mockPrisma.mFASecret.update.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.verifyAndEnable("user-1", "123456");

      expect(result).toBe(true);
      // Should mark MFA record as verified
      expect(mockPrisma.mFASecret.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: "user-1" },
          data: expect.objectContaining({ verified: true }),
        }),
      );
      // Should set mfaEnabled on the user
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { mfaEnabled: true },
      });
    });

    it("should throw if MFA has not been set up", async () => {
      mockPrisma.mFASecret.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyAndEnable("user-1", "123456"),
      ).rejects.toThrow("MFA has not been set up");
    });

    it("should throw if TOTP code is invalid", async () => {
      mockPrisma.mFASecret.findUnique.mockResolvedValue({
        userId: "user-1",
        secretHash: "encrypted-secret",
      });
      (verifyTOTP as any).mockResolvedValue(false);

      await expect(
        service.verifyAndEnable("user-1", "000000"),
      ).rejects.toThrow("Invalid MFA token");
    });
  });

  // ─── verifyChallenge ──────────────────────────────────────────────────
  // What it does:
  // 1. Find MFA record — must be verified
  // 2. Try TOTP code first
  // 3. If TOTP fails → try each backup code (one-time use)
  // 4. If both fail → throw
  // 5. On success → create a real session with tokens
  describe("verifyChallenge", () => {
    it("should create session when TOTP code is valid", async () => {
      mockPrisma.mFASecret.findUnique.mockResolvedValue({
        userId: "user-1",
        secretHash: "encrypted-secret",
        verified: true,
        backupCodes: ["hashed-code1", "hashed-code2"],
      });
      (verifyTOTP as any).mockResolvedValue(true);

      mockPrisma.session.create.mockResolvedValue({
        id: "session-1",
        userId: "user-1",
      });

      const result = await service.verifyChallenge("user-1", "123456");

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it("should accept a valid backup code when TOTP fails", async () => {
      mockPrisma.mFASecret.findUnique.mockResolvedValue({
        userId: "user-1",
        secretHash: "encrypted-secret",
        verified: true,
        backupCodes: ["hashed-backup1", "hashed-backup2"],
      });
      // TOTP fails
      (verifyTOTP as any).mockResolvedValue(false);
      // First backup code matches
      (verifyBackupCode as any)
        .mockResolvedValueOnce(true);

      mockPrisma.mFASecret.update.mockResolvedValue({});
      mockPrisma.session.create.mockResolvedValue({
        id: "session-1",
        userId: "user-1",
      });

      const result = await service.verifyChallenge("user-1", "backup-code");

      expect(result.accessToken).toBeDefined();
      // Backup code should be removed from the list (one-time use)
      expect(mockPrisma.mFASecret.update).toHaveBeenCalled();
    });

    it("should throw when both TOTP and backup codes fail", async () => {
      mockPrisma.mFASecret.findUnique.mockResolvedValue({
        userId: "user-1",
        secretHash: "encrypted-secret",
        verified: true,
        backupCodes: ["hashed-code1"],
      });
      (verifyTOTP as any).mockResolvedValue(false);
      (verifyBackupCode as any).mockResolvedValue(false);

      await expect(
        service.verifyChallenge("user-1", "wrong-code"),
      ).rejects.toThrow("Invalid MFA code");
    });

    it("should throw if MFA is not set up or not verified", async () => {
      mockPrisma.mFASecret.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyChallenge("user-1", "123456"),
      ).rejects.toThrow("MFA has not been set up");
    });
  });

  // ─── disable ──────────────────────────────────────────────────────────
  // What it does:
  // 1. Find MFA record — must be verified
  // 2. Verify TOTP code (so user can't disable MFA without proving identity)
  // 3. Delete MFA record and set mfaEnabled to false
  describe("disable", () => {
    it("should disable MFA with valid code", async () => {
      mockPrisma.mFASecret.findUnique.mockResolvedValue({
        userId: "user-1",
        secretHash: "encrypted-secret",
        verified: true,
      });
      (verifyTOTP as any).mockResolvedValue(true);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.disable("user-1", "123456");

      expect(result).toBe(true);
    });

    it("should throw if MFA is not enabled", async () => {
      mockPrisma.mFASecret.findUnique.mockResolvedValue(null);

      await expect(service.disable("user-1", "123456")).rejects.toThrow(
        "MFA is not enabled",
      );
    });

    it("should throw if TOTP code is invalid", async () => {
      mockPrisma.mFASecret.findUnique.mockResolvedValue({
        userId: "user-1",
        secretHash: "encrypted-secret",
        verified: true,
      });
      (verifyTOTP as any).mockResolvedValue(false);

      await expect(service.disable("user-1", "000000")).rejects.toThrow(
        "Invalid MFA code",
      );
    });
  });
});
