import { prisma } from "../../../config/prisma";
import { GoogleProvider } from "./providers/google.provider";
import { GitHubProvider } from "./providers/github.provider";
import { FacebookProvider } from "./providers/facebook.provider";
import { AppError } from "../../../lib/AppError";
import { BAD_REQUEST } from "../../../config/http";
import type { OAuthProvider } from "./oauth.types";

/** Fields returned from OAuth user lookups (never includes passwordHash) */
const USER_SELECT = {
  id: true,
  fullname: true,
  email: true,
  emailVerified: true,
  mfaEnabled: true,
  createdAt: true,
} as const;

export class OAuthService {
  // Registry of all supported providers
  private static providers: Record<string, OAuthProvider> = {
    google: new GoogleProvider(),
    github: new GitHubProvider(),
    facebook: new FacebookProvider(),
  };

  static async handleCallback(providerName: string, code: string) {
    const strategy = this.providers[providerName];
    if (!strategy) {
      throw new AppError(BAD_REQUEST, `Provider ${providerName} is not supported.`);
    }

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
        include: { user: { select: USER_SELECT } },
      });

      if (existingAccount) return existingAccount.user;

      // Check if the user exists by email (Account Linking)
      const existingUser = await tx.user.findUnique({
        where: { email: profile.email },
        select: USER_SELECT,
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
          fullname: profile.fullname, // Optional: you can fetch this from the provider if available
          email: profile.email,
          passwordHash: null, // OAuth-only users have no password
          emailVerified: true,
          oauthAccounts: {
            create: {
              provider: profile.provider,
              providerUserId: profile.providerUserId,
            },
          },
        },
        select: USER_SELECT,
      });
    });
  }
}
