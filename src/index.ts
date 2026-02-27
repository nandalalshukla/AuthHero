// ─── AuthHero — Library Entry Point ──────────────────────────────────────────
// This file is the public API surface. Everything users can import from "authhero".

export { createAuthHero } from "./createAuthHero";
export type { AuthHero } from "./createAuthHero";

export { AppError, AppErrorCode } from "./lib/AppError";
export type { PublicUser, AccessTokenPayload } from "./modules/auth/auth.types";
