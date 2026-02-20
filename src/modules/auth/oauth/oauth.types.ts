/**
 * Standardized user profile structure returned by all OAuth providers.
 * This allows the OAuthService to process any social login without 
 * knowing provider-specific field names.
 */
export interface OAuthUserProfile {
  /** The unique ID provided by Google, GitHub, or Facebook */
  providerUserId: string;
  
  /** The user's primary email address */
  email: string;
  
  /** The name of the provider (e.g., 'google', 'github') */
  provider: string;
}

/**
 * Interface that all OAuth Provider classes must implement.
 * This is the core of the Strategy Pattern.
 */
export interface OAuthProvider {
  /**
   * Exchanges an authorization code for a standardized profile.
   * @param code The authorization code received from the callback.
   */
  getProfile(code: string): Promise<OAuthUserProfile>;
}

/**
 * Valid OAuth provider names as defined in your Prisma Schema.
 * Using a union type prevents typos in your service and controller.
 */
export type SupportedProvider = 'google' | 'github' | 'facebook';

/**
 * Optional: Configuration interface if you want to make 
 * your providers even more dynamic.
 */
export interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}