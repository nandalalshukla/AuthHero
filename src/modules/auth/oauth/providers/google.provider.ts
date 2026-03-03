import axios from "axios";
import type { OAuthProvider, OAuthUserProfile } from "../oauth.types";
import { env } from "../../../../config/env";
import { AppError } from "../../../../lib/AppError";
import { INTERNAL_SERVER_ERROR, BAD_REQUEST } from "../../../../config/http";
import { logger } from "../../../../lib/logger";

export class GoogleProvider implements OAuthProvider {
  private static readonly TOKEN_URL = "https://oauth2.googleapis.com/token";
  private static readonly USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

  private getConfig() {
    const clientId = env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;
    const redirectUri = env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new AppError(
        INTERNAL_SERVER_ERROR,
        "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.",
      );
    }

    return { clientId, clientSecret, redirectUri };
  }

  async getProfile(code: string): Promise<OAuthUserProfile> {
    const { clientId, clientSecret, redirectUri } = this.getConfig();

    try {
      // 1. Exchange auth code for access token
      const tokenResponse = await axios.post(GoogleProvider.TOKEN_URL, {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      });

      const { access_token, id_token } = tokenResponse.data;
      if (!access_token) {
        throw new AppError(BAD_REQUEST, "Failed to obtain Google access token");
      }

      // 2. Fetch user profile using the access token
      const { data: profile } = await axios.get(GoogleProvider.USERINFO_URL, {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      return {
        providerUserId: profile.id,
        email: profile.email,
        fullname: profile.name,
        profilePictureUrl: profile.picture,
        provider: "google",
        oidcToken: id_token,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ err: error }, "Google OAuth error");
      throw new AppError(INTERNAL_SERVER_ERROR, "Google authentication failed");
    }
  }
}
