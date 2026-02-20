export interface MFASetupResponse {
  qrCodeUrl: string; // The otpauth:// URI to generate a QR code on frontend
  secret: string; // The raw secret (only show once during setup)
  backupCodes: string[]; // Recovery codes for when the user loses their phone
}

export interface VerifyMFAPayload {
  userId: string;
  code: string; // The 6-digit TOTP code
}
