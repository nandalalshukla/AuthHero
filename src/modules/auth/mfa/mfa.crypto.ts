import * as OTPAuth from "otplib";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import QRCode from "qrcode";

const { authenticator } = OTPAuth;

authenticator.options = {
  window: 1,
};

export const generateTOTPSecret = () => {
  return authenticator.generateSecret();
};

export const generateOTPAuthURL = (email: string, secret: string) => {
  return authenticator.keyuri(email, "YourApp", secret);
};

export const generateQRCode = async (otpauth: string) => {
  return QRCode.toDataURL(otpauth);
};

export const verifyTOTP = (token: string, secret: string) => {
  return authenticator.verify({ token, secret });
};

export const generateBackupCodes = () => {
  return Array.from({ length: 8 }, () => crypto.randomBytes(4).toString("hex"));
};

export const hashBackupCode = async (code: string) => {
  return bcrypt.hash(code, 12);
};

export const verifyBackupCode = async (code: string, hash: string) => {
  return bcrypt.compare(code, hash);
};
