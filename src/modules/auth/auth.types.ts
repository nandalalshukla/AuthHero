// What we expose publicly about a user
export interface PublicUser {
  id: string;
  email: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
}

// What access token contains
export interface AccessTokenPayload {
  userId: string;
  sessionId: string;
}

// What login/register returns
export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}
