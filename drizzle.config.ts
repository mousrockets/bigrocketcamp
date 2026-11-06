import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'drizzle-kit';

// `npm run db:generate` writes the next migration from src/lib/schema.ts into migrations/, which wrangler
// applies (npm run db:migrate locally, npm run deploy in production). `npm run db:studio` browses the local
// database that `npm run dev` uses; never the production one.

const localDatabases = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';

function localDatabase(): string {
  const files = (() => {
    try {
      return readdirSync(localDatabases).filter((file) => file.endsWith('.sqlite') && file !== 'metadata.sqlite');
    } catch {
      return [];
    }
  })();
  const newest = files
    .map((file) => join(localDatabases, file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  // Before the first `npm run db:migrate` there is nothing to browse; generating needs no database.
  return `file:${newest ?? join(localDatabases, 'missing.sqlite')}`;
}

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/schema.ts',
  out: './migrations',
  dbCredentials: { url: localDatabase() },
});
