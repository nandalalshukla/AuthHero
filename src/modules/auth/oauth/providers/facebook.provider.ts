import axios from "axios";
import type { OAuthProvider, OAuthUserProfile } from "../oauth.types";
import { env } from "../../../../config/env";
import { AppError } from "../../../../lib/AppError";
import { INTERNAL_SERVER_ERROR, BAD_REQUEST } from "../../../../config/http";
import { logger } from "../../../../lib/logger";

export class FacebookProvider implements OAuthProvider {
  private static readonly TOKEN_URL =
    "https://graph.facebook.com/v12.0/oauth/access_token";
  private static readonly USER_URL = "https://graph.facebook.com/me";

  private getConfig() {
    const clientId = env.FACEBOOK_CLIENT_ID;
    const clientSecret = env.FACEBOOK_CLIENT_SECRET;
    const redirectUri = env.FACEBOOK_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new AppError(
        INTERNAL_SERVER_ERROR,
        "Facebook OAuth is not configured. Set FACEBOOK_CLIENT_ID, FACEBOOK_CLIENT_SECRET, and FACEBOOK_REDIRECT_URI.",
      );
    }

    return { clientId, clientSecret, redirectUri };
  }

  async getProfile(code: string): Promise<OAuthUserProfile> {
    const { clientId, clientSecret, redirectUri } = this.getConfig();

    try {
      // 1. Exchange auth code for access token
      const tokenResponse = await axios.get(FacebookProvider.TOKEN_URL, {
        params: {
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
        },
      });

      const accessToken = tokenResponse.data.access_token;
      if (!accessToken) {
        throw new AppError(BAD_REQUEST, "Failed to obtain Facebook access token");
      }

      // 2. Fetch user data (must explicitly ask for 'name' and 'email' fields)
      const { data: profile } = await axios.get(FacebookProvider.USER_URL, {
        params: {
          fields: "id,name,email",
          access_token: accessToken,
        },
      });

      if (!profile.email) {
        throw new AppError(
          BAD_REQUEST,
          "Facebook account must have an associated email address",
        );
      }

      return {
        providerUserId: profile.id,
        email: profile.email,
        fullname: profile.name ?? "Facebook User",
        provider: "facebook",
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ err: error }, "Facebook OAuth error");
      throw new AppError(INTERNAL_SERVER_ERROR, "Facebook authentication failed");
    }
  }
}
