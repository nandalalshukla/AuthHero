export interface MFASetupResponse {
  qrCode: string;
  backupCodes: string[];
}

export interface MFAVerifyInput {
  token: string;
}

export interface MFAChallengeInput {
  tempToken: string;
  code: string;
}
