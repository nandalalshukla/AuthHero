import axios from "axios";
import type { OAuthProvider, OAuthUserProfile } from "../oauth.types";
import { env } from "../../../../config/env";

export class GitHubProvider implements OAuthProvider {
  private readonly clientId = env.GITHUB_CLIENT_ID!;
  private readonly clientSecret = env.GITHUB_CLIENT_SECRET!;
  private readonly redirectUri = env.GITHUB_REDIRECT_URI!; // Added this

  async getProfile(code: string): Promise<OAuthUserProfile> {
    const tokenResponse = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.redirectUri, // Now explicitly sent
      },
      { headers: { Accept: "application/json" } },
    );

    // ... rest of your code ...
  }
}

    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) throw new Error("Failed to obtain GitHub access token");

    // 2. Fetch the GitHub User profile
    const { data: profile } = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    // 3. Fetch emails (GitHub requires a separate call for private emails)
    const { data: emails } = await axios.get(
      "https://api.github.com/user/emails",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    // Find the primary, verified email
    const primaryEmail =
      emails.find((e: any) => e.primary && e.verified)?.email ||
      emails[0]?.email;

    return {
      providerUserId: profile.id.toString(),
      email: primaryEmail,
      provider: "github",
    };
  }
}