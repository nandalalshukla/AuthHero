import type { Request, Response } from "express";
import { OAuthService } from "./oauth.service";
import type { SupportedProvider } from "./oauth.types";

export class OAuthController {
  /**
   * Handles the redirection back from the OAuth Provider
   */
  static async handleCallback(req: Request, res: Response) {
    try {
      const { provider } = req.params as { provider: SupportedProvider };
      const { code, state } = req.query;

      // 1. Security Check: Validate state to prevent CSRF
      const savedState = req.cookies[`${provider}_auth_state`];
      if (!state || state !== savedState) {
        return res
          .status(403)
          .json({ error: "Invalid state parameter. CSRF detected." });
      }

      if (!code) {
        return res.status(400).json({ error: "Authorization code missing." });
      }

      // 2. Business Logic: Exchange code for User via Service
      const user = await OAuthService.handleCallback(provider, code as string);

      // 3. Session Management: Clear state cookie and create session
      res.clearCookie(`${provider}_auth_state`);

      // NOTE: Here you would call your existing SessionService to create a JWT
      // Example: const token = SessionService.generateToken(user.id);

      // 4. Final Step: Redirect to Frontend
      return res.redirect(
        `${process.env.FRONTEND_URL}/auth-success?token=REPLACEME`,
      );
    } catch (error: any) {
      console.error(`[OAuth Error]: ${error.message}`);
      return res.status(500).json({ error: "Authentication failed" });
    }
  }

  /**
   * Helper to generate the Login URL for the frontend
   */
  static async getAuthUrl(req: Request, res: Response) {
    // Implementation for generating the initial redirect URL
    // and setting the 'state' cookie would go here.
  }
}
