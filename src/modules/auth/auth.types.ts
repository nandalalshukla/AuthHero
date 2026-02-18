//What data about user we want to expose
import "express";

declare module "express-serve-static-core" {
  interface Request {
    user?: AccessTokenPayload;
  }
}
export interface PublicUser {
  id: string;
  email: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
}

//What access token can contain
export interface AccessTokenPayload {
  userId: string;
  sessionId: string;
}

export interface registerResponse {
  user: PublicUser;
  verificationToken: string;
}

//What login response should contain
export interface loginResponse {
  accessToken: string;
  refreshToken: string;
}

export type refreshResponse = {
  accessToken: string;
  refreshToken: string;
};
