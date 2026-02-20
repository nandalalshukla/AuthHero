import axios from "axios";
import type { OAuthProvider, OAuthUserProfile } from "../oauth.types";
import {env} from "../../../../config/env";

export class GoogleProvider implements OAuthProvider {
  private readonly clientId = env.GOOGLE_CLIENT_ID!;
  private readonly clientSecret = env.GOOGLE_CLIENT_SECRET!;
  private readonly redirectUri = env.GOOGLE_REDIRECT_URI!;

  async getProfile(code: string): Promise<OAuthUserProfile> {
    // 1. Exchange auth code for access token
    const tokenResponse = await axios.post(
      "https://oauth2.googleapis.com/token",
      {
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: "authorization_code",
      },
    );

    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) throw new Error("Failed to obtain Google access token");

    // 2. Fetch user profile using the access token
    const { data: profile } = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    return {
      providerUserId: profile.id,
      email: profile.email,
      provider: "google",
    };
  }
}
