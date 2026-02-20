import axios from 'axios';
import prisma from '../../../lib/prisma';

export class OAuthService {
  // 1. Exchange the code from Google/GitHub for a profile
  static async getGoogleUser(code: string) {
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    });

    const { access_token } = tokenResponse.data;
    const { data: profile } = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    return { id: profile.id, email: profile.email };
  }

  // 2. The Professional Link/Create Logic
  static async handleUserSync(provider: string, providerId: string, email: string) {
    return await prisma.$transaction(async (tx) => {
      // Check if this specific OAuth account is already linked
      const existingOAuth = await tx.oAuthAccount.findUnique({
        where: { provider_providerUserId: { provider, providerUserId: providerId } },
        include: { user: true }
      });

      if (existingOAuth) return existingOAuth.user;

      // Check if a user with this email exists (Account Linking)
      const existingUser = await tx.user.findUnique({ where: { email } });

      if (existingUser) {
        // PROFESSIONAL CHOICE: Link the account if they are logged in, 
        // OR throw an error requiring them to login with password first to prove ownership.
        return await tx.user.update({
          where: { id: existingUser.id },
          data: {
            oauthAccounts: { create: { provider, providerUserId: providerId } }
          }
        });
      }

      // Create brand new user
      return await tx.user.create({
        data: {
          email,
          passwordHash: '', // No password for pure OAuth users
          emailVerified: true,
          oauthAccounts: { create: { provider, providerUserId: providerId } }
        }
      });
    });
  }
}