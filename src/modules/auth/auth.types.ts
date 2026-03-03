//What data about user we want to expose
import "express";

declare module "express-serve-static-core" {
  interface Request {
    user?: AccessTokenPayload;
  }
}
export interface PublicUser {
  id: string;
  fullname: string;
  email: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: Date;
}

//What access token can contain
export interface AccessTokenPayload {
  userId: string;
  sessionId: string;
}

export interface RegisterResponse {
  user: PublicUser;
  verificationToken: string;
}

//What login response should contain
export interface LoginResponse {
  mfaRequired: false;
  accessToken: string;
  refreshToken: string;
}

export interface LoginMFAResponse {
  mfaRequired: true;
  tempToken: string;
}

export type RefreshResponse = {
  accessToken: string;
  refreshToken: string;
};
