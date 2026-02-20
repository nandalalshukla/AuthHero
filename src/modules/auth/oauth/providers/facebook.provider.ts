import axios from "axios";
import type { OAuthProvider, OAuthUserProfile } from "../oauth.types";
import { env } from "../../../../config/env";

export class FacebookProvider implements OAuthProvider {
  private readonly clientId = env.FACEBOOK_CLIENT_ID!;
  private readonly clientSecret = env.FACEBOOK_CLIENT_SECRET!;
  private readonly redirectUri = env.FACEBOOK_REDIRECT_URI!;

  async getProfile(code: string): Promise<OAuthUserProfile> {
    // 1. Exchange auth code for access token
    const tokenResponse = await axios.get(
      "https://graph.facebook.com/v12.0/oauth/access_token",
      {
        params: {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
          code,
        },
      },
    );

    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) throw new Error("Failed to obtain Facebook access token");

    // 2. Fetch user data (must explicitly ask for 'email' field)
    const { data: profile } = await axios.get("https://graph.facebook.com/me", {
      params: {
        fields: "id,email",
        access_token: accessToken,
      },
    });

    if (!profile.email) {
      throw new Error("Facebook account must have an associated email address");
    }

    return {
      providerUserId: profile.id,
      email: profile.email,
      provider: "facebook",
    };
  }
}
