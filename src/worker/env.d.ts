// Secrets and settings set in the Cloudflare dashboard, absent from wrangler.jsonc.
interface Env {
  /** Resend API key: sends the sign-in codes. Without it, local development prints them in the console. */
  RESEND_API_KEY?: string;
  /** Sender of the sign-in e-mails, e.g. `Les Trois Mousrockets <hello@example.com>`. */
  MAIL_FROM?: string;
  /** Key of the instance's rank source (`X-Rank-Source-Key`), at least 32 characters. */
  RANK_SOURCE_KEY?: string;
}
