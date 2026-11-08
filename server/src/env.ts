/** Bindings and settings (wrangler.toml vars and `wrangler secret`). */
export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  /** Comma-separated exact origins allowed to call the API and open WebSockets. */
  ALLOWED_ORIGINS: string;
  /** Staging only: a regular expression for this project's Vercel preview URLs ("" = none). */
  PREVIEW_ORIGIN_PATTERN: string;
  /** Secret: the NHSQA admin account's email. */
  ADMIN_EMAIL?: string;
  /** Secret: mixed into every password hash. */
  PEPPER?: string;
}
