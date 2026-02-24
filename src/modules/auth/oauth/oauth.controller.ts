import type { Request, Response } from "express";
import { OAuthService } from "./oauth.service";
import type { SupportedProvider } from "./oauth.types";
import {
  generateAccessToken,
  generateMFATempToken,
  generateRandomToken,
  hashRandomToken,
} from "../../../config/jwt";
import { prisma } from "../../../config/prisma";
import { refreshTokenCookieOptions } from "../../../config/cookies";
import { addDays } from "date-fns";
import { env } from "../../../config/env";
import { redisClient } from "../../../config/redis";
import { AppError } from "../../../lib/AppError";
import { BAD_REQUEST, OK } from "../../../config/http";
import crypto from "crypto";

export class OAuthController {
  /**
   * Generates the initial redirect URL and sets a CSRF state cookie.
   *
   * How OAuth state works:
   * 1. We generate a random string (state) and store it in a cookie
   * 2. We include the same state in the redirect URL to the OAuth provider
   * 3. When the provider calls us back, it includes the state in the query
   * 4. We compare the cookie state with the query state — if they don't match,
   *    someone is doing a CSRF attack (tricking the user into authenticating
   *    with the attacker's account)
   */
  static async getAuthUrl(req: Request, res: Response) {
    const { provider } = req.params as { provider: SupportedProvider };

    const state = crypto.randomBytes(32).toString("hex");

    // Store state in a short-lived httpOnly cookie
    res.cookie(`${provider}_auth_state`, state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 10 * 60 * 1000, // 10 minutes
    });

    const urls: Record<SupportedProvider, string> = {
      google: `https://accounts.google.com/o/oauth2/v2/auth?client_id=${env.GOOGLE_CLIENT_ID}&redirect_uri=${env.GOOGLE_REDIRECT_URI}&response_type=code&scope=email+profile&state=${state}`,
      github: `https://github.com/login/oauth/authorize?client_id=${env.GITHUB_CLIENT_ID}&redirect_uri=${env.GITHUB_REDIRECT_URI}&scope=user:email&state=${state}`,
      facebook: `https://www.facebook.com/v12.0/dialog/oauth?client_id=${env.FACEBOOK_CLIENT_ID}&redirect_uri=${env.FACEBOOK_REDIRECT_URI}&scope=email&state=${state}`,
    };

    const url = urls[provider];
    if (!url) {
      return res
        .status(400)
        .json({ success: false, message: `Unsupported provider: ${provider}` });
    }

    return res.json({ success: true, data: { url } });
  }

  /**
   * Handles the callback from the OAuth provider.
   * Validates the CSRF state, exchanges the code for a user profile,
   * then stores session data behind a one-time code (NOT in the URL).
   *
   * Security: We never put access tokens in redirect URLs because they
   * leak via browser history, Referer headers, and server logs.
   * Instead, we generate a short-lived one-time code stored in Redis,
   * redirect the frontend with that code, and the frontend exchanges
   * it for real tokens via POST /auth/oauth/exchange.
   */
  static async handleCallback(req: Request, res: Response) {
    const { provider } = req.params as { provider: SupportedProvider };
    const { code, state } = req.query;

    // 1. CSRF check: compare state from cookie with state from query
    const savedState = req.cookies?.[`${provider}_auth_state`];
    if (!state || state !== savedState) {
      return res.status(403).json({
        success: false,
        message: "Invalid state parameter. Possible CSRF attack.",
      });
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Authorization code missing.",
      });
    }

    // 2. Exchange code for user profile and sync with DB
    const user = await OAuthService.handleCallback(provider, code as string);

    // Clear the CSRF state cookie (no longer needed)
    res.clearCookie(`${provider}_auth_state`);

    const frontendUrl = env.FRONTEND_URL || env.APP_URL;

    // 3. If user has MFA enabled, issue a temp token via one-time code
    if (user.mfaEnabled) {
      const tempToken = generateMFATempToken(user.id);
      const oneTimeCode = crypto.randomBytes(32).toString("hex");

      // Store in Redis with 2-minute TTL (one-time use)
      await redisClient.set(
        `oauth_code:${oneTimeCode}`,
        JSON.stringify({ mfaRequired: true, tempToken }),
        "EX",
        120,
      );

      return res.redirect(`${frontendUrl}/auth/callback?code=${oneTimeCode}`);
    }

    // 4. Create session (same logic as email/password login)
    const refreshToken = generateRandomToken(40);
    const refreshTokenHash = hashRandomToken(refreshToken);
    const refreshTokenExpiresAt = addDays(new Date(), 30);

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        expiresAt: refreshTokenExpiresAt,
        userAgent: req.headers["user-agent"],
        ipAddress: req.ip,
      },
    });

    const accessToken = generateAccessToken(user.id, session.id);

    // 5. Store tokens behind a one-time code in Redis (2-minute TTL)
    const oneTimeCode = crypto.randomBytes(32).toString("hex");
    await redisClient.set(
      `oauth_code:${oneTimeCode}`,
      JSON.stringify({ mfaRequired: false, accessToken, refreshToken }),
      "EX",
      120,
    );

    // 6. Redirect with the opaque one-time code (NOT the access token)
    return res.redirect(`${frontendUrl}/auth/callback?code=${oneTimeCode}`);
  }

  /**
   * Exchanges a one-time OAuth code for real tokens.
   *
   * POST /auth/oauth/exchange
   * Body: { code: string }
   *
   * The frontend calls this after receiving the one-time code from
   * the OAuth redirect. The code is consumed (deleted from Redis)
   * on first use, preventing replay attacks.
   */
  static async exchangeCode(req: Request, res: Response) {
    const { code } = req.body;

    if (!code) {
      throw new AppError(BAD_REQUEST, "One-time code is required");
    }

    const key = `oauth_code:${code}`;
    const data = await redisClient.get(key);

    if (!data) {
      throw new AppError(BAD_REQUEST, "Invalid or expired code");
    }

    // Delete immediately — one-time use only
    await redisClient.del(key);

    const parsed = JSON.parse(data);

    // MFA flow — return temp token for the client to complete MFA challenge
    if (parsed.mfaRequired) {
      return res.status(OK).json({
        success: true,
        message: "MFA verification required",
        data: { mfaRequired: true, tempToken: parsed.tempToken },
      });
    }

    // Normal flow — set refresh token cookie and return access token
    res.cookie("refreshToken", parsed.refreshToken, refreshTokenCookieOptions);

    return res.status(OK).json({
      success: true,
      message: "OAuth login successful",
      data: { mfaRequired: false, accessToken: parsed.accessToken },
    });
  }
}
