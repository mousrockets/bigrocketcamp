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
        miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
      }),
    ],
    define: { __APP_COMMIT__: JSON.stringify('test') },
    test: { setupFiles: ['./src/test-setup.ts'] },
  };
});
