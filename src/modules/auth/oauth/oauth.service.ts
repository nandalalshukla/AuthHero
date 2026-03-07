import { prisma } from "../../../config/prisma";
import { GoogleProvider } from "./providers/google.provider";
import { GitHubProvider } from "./providers/github.provider";
import { FacebookProvider } from "./providers/facebook.provider";
import { AppError, AppErrorCode } from "../../../lib/AppError";
import { BAD_REQUEST, FORBIDDEN } from "../../../config/http";
import type { OAuthProvider } from "./oauth.types";

/** Fields returned from OAuth user lookups (never includes passwordHash) */
const USER_SELECT = {
  id: true,
  fullname: true,
  email: true,
  emailVerified: true,
  mfaEnabled: true,
  deactivatedAt: true,
  deletedAt: true,
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
    //    maxWait: how long to wait to acquire a connection from the pool
    //    timeout: max duration the transaction body can run
    return await prisma.$transaction(
      async (tx) => {
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

        if (existingAccount) {
          // Soft-deleted account: hard-delete and fall through to create fresh
          if (existingAccount.user.deletedAt) {
            await tx.user.delete({ where: { id: existingAccount.user.id } });
            // Fall through to create a new user below
          } else if (existingAccount.user.deactivatedAt) {
            // Auto-reactivate on OAuth login
            await tx.user.update({
              where: { id: existingAccount.user.id },
              data: { deactivatedAt: null },
            });
            return { ...existingAccount.user, deactivatedAt: null };
          } else {
            return existingAccount.user;
          }
        }

        // Check if the user exists by email (Account Linking)
        const existingUser = await tx.user.findUnique({
          where: { email: profile.email },
          select: { ...USER_SELECT, id: true },
        });

        if (existingUser) {
          // Soft-deleted user: hard-delete to free the email, then fall through
          // to create a brand-new account (mirrors registerUser behaviour).
          if (existingUser.deletedAt) {
            await tx.user.delete({ where: { id: existingUser.id } });
            // Fall through to create a new user below
          } else if (existingUser.deactivatedAt) {
            // Auto-reactivate deactivated users on OAuth login — they can't use
            // the password-based reactivation flow if they're OAuth-only.
            await tx.user.update({
              where: { id: existingUser.id },
              data: { deactivatedAt: null },
            });
            // Link the provider if not already linked
            await tx.oAuthAccount.upsert({
              where: {
                provider_providerUserId: {
                  provider: profile.provider,
                  providerUserId: profile.providerUserId,
                },
              },
              update: {},
              create: {
                userId: existingUser.id,
                provider: profile.provider,
                providerUserId: profile.providerUserId,
              },
            });
            return { ...existingUser, deactivatedAt: null };
          } else {
            // Active user — link the new social provider
            await tx.oAuthAccount.create({
              data: {
                userId: existingUser.id,
                provider: profile.provider,
                providerUserId: profile.providerUserId,
              },
            });
            return existingUser;
          }
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
      },
      { maxWait: 8_000, timeout: 10_000 },
    );
  }
}
