declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    EPIC_VAULT_KEY?: string;
  }
}
