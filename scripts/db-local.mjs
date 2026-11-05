import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import hosting from "../.openai/hosting.json" with { type: "json" };

// Applies migrations to the local D1 used by `npm run dev` only; never --remote.
const root = fileURLToPath(new URL("..", import.meta.url));
const config = new URL("../.wrangler/local-migrate.json", import.meta.url);
mkdirSync(new URL("../.wrangler/", import.meta.url), { recursive: true });
writeFileSync(config, JSON.stringify({
  name: "rlpompes-local-migrate",
  compatibility_date: "2025-01-01",
  d1_databases: [{
    binding: hosting.d1,
    database_name: "site-creator-d1",
    database_id: "00000000-0000-4000-8000-000000000000",
    migrations_dir: "../drizzle",
  }],
}, null, 2));
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url)),
  "d1", "migrations", "apply", hosting.d1, "--local",
  "--config", fileURLToPath(config), "--persist-to", ".wrangler/state",
], { cwd: root, stdio: "inherit", env: { ...process.env, CI: "1" } });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
