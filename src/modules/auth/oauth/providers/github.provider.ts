import axios from "axios";
import type { OAuthProvider, OAuthUserProfile } from "../oauth.types";
import { env } from "../../../../config/env";
import { AppError } from "../../../../lib/AppError";
import { INTERNAL_SERVER_ERROR, BAD_REQUEST } from "../../../../config/http";
import { logger } from "../../../../lib/logger";

export class GitHubProvider implements OAuthProvider {
  private static readonly TOKEN_URL = "https://github.com/login/oauth/access_token";
  private static readonly USER_URL = "https://api.github.com/user";
  private static readonly EMAILS_URL = "https://api.github.com/user/emails";

  private getConfig() {
    const clientId = env.GITHUB_CLIENT_ID;
    const clientSecret = env.GITHUB_CLIENT_SECRET;
    const redirectUri = env.GITHUB_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new AppError(
        INTERNAL_SERVER_ERROR,
        "GitHub OAuth is not configured. Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and GITHUB_REDIRECT_URI.",
      );
    }

    return { clientId, clientSecret, redirectUri };
  }

  async getProfile(code: string): Promise<OAuthUserProfile> {
    const { clientId, clientSecret, redirectUri } = this.getConfig();

    try {
      // 1. Exchange auth code for access token
      const tokenResponse = await axios.post(
        GitHubProvider.TOKEN_URL,
        {
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        },
        { headers: { Accept: "application/json" } },
      );

      const accessToken = tokenResponse.data.access_token;
      if (!accessToken) {
        throw new AppError(BAD_REQUEST, "Failed to obtain GitHub access token");
      }

      // 2. Fetch the GitHub User profile
      const { data: profile } = await axios.get(GitHubProvider.USER_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // 3. Fetch emails (GitHub requires a separate call for private emails)
      const { data: emails } = await axios.get(GitHubProvider.EMAILS_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // Find the primary, verified email
      const primaryEmail =
        emails.find(
          (e: { primary: boolean; verified: boolean; email: string }) =>
            e.primary && e.verified,
        )?.email || emails[0]?.email;

      if (!primaryEmail) {
        throw new AppError(
          BAD_REQUEST,
          "Unable to retrieve email from GitHub. Ensure your GitHub account has a verified email.",
        );
      }

      return {
        providerUserId: profile.id.toString(),
        email: primaryEmail,
        fullname: profile.name,
        profilePictureUrl: profile.avatar_url,
        provider: "github",
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ err: error }, "GitHub OAuth error");
      throw new AppError(INTERNAL_SERVER_ERROR, "GitHub authentication failed");
    }
  }
}
