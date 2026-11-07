import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// The tests run inside the Workers runtime, with the bindings declared in wrangler.jsonc
// and a fresh local D1 database migrated before each test file.
export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        // MIGRATION_DB replays the migrations one by one: each migration test starts from the schema it ran on.
        miniflare: { bindings: { TEST_MIGRATIONS: migrations }, d1Databases: ['MIGRATION_DB'] },
      }),
    ],
    define: { __APP_COMMIT__: JSON.stringify('test') },
    // The shadcn components import each other through the app's alias, as in vite.config.ts.
    resolve: { alias: { '@': fileURLToPath(new URL('./src/web', import.meta.url)) } },
    test: { setupFiles: ['./src/test-setup.ts'] },
  };
});
