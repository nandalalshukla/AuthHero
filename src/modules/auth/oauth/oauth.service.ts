import { prisma } from "../../../config/prisma";
import { GoogleProvider } from "./providers/google.provider";
import { GitHubProvider } from "./providers/github.provider";
import { FacebookProvider } from "./providers/facebook.provider";
import type { OAuthProvider } from "./oauth.types";


export class OAuthService {
  // Registry of all supported providers
  private static providers: Record<string, OAuthProvider> = {
    google: new GoogleProvider(),
    github: new GitHubProvider(),
    facebook: new FacebookProvider(),
  };

  /**
   * Main entry point for the OAuth Callback.
   * Handles profile fetching and DB synchronization.
   */
  static async handleCallback(providerName: string, code: string) {
    const strategy = this.providers[providerName];
    if (!strategy)
      throw new Error(`Provider ${providerName} is not supported.`);

    // 1. Fetch profile from the third-party API
    const profile = await strategy.getProfile(code);

    // 2. Execute DB sync in a transaction for data integrity
    return await prisma.$transaction(async (tx) => {
      // Check if this specific social account is already linked
      const existingAccount = await tx.oAuthAccount.findUnique({
        where: {
          provider_providerUserId: {
            provider: profile.provider,
            providerUserId: profile.providerUserId,
          },
        },
        include: { user: true },
      });

      if (existingAccount) return existingAccount.user;

      // Check if the user exists by email (Account Linking)
      const existingUser = await tx.user.findUnique({
        where: { email: profile.email },
      });

      if (existingUser) {
        // Link the existing user to the new social provider
        await tx.oAuthAccount.create({
          data: {
            userId: existingUser.id,
            provider: profile.provider,
            providerUserId: profile.providerUserId,
          },
        });
        return existingUser;
      }

      // Create a brand new user for a new social login
      return await tx.user.create({
        data: {
          email: profile.email,
          passwordHash: "", // Social-only users have no password
          emailVerified: true,
          oauthAccounts: {
            create: {
              provider: profile.provider,
              providerUserId: profile.providerUserId,
            },
          },
        },
      });
    });
  }
}
