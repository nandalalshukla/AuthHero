import jwt from "jsonwebtoken";

export function generateAccessToken(userId: string, userRole: string) {
  return jwt.sign({ userId, userRole }, process.env.ACCESS_TOKEN_SECRET!, {
    expiresIn: "2m",
  });
}

export function generateRefreshToken(userId: string) {
  return jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET!, {
    expiresIn: "7d",
  });
}
export function generateEmailVerifyToken(userId: string) {
  return jwt.sign({ userId }, process.env.VERIFY_EMAIL_TOKEN_SECRET!, {
    expiresIn: "30m",
  });
}

export function generateForgetPswdToken(userId: string) {
  return jwt.sign({ userId }, process.env.FORGET_PSWD_TOKEN_SECRET!, {
    expiresIn: "30m",
  });
}

export function generateChangePswdToken(userId: string) {
  return jwt.sign({ userId }, process.env.RESET_PSWD_TOKEN_SECRET!, {
    expiresIn: "35m",
  });
}
