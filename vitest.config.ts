import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Two kinds of unit tests, run together by `npm test`:
// - the API, the shared logic and the build scripts (src/worker, src/lib, scripts) run inside the Workers runtime, with the bindings declared in
//   wrangler.jsonc and a fresh local D1 database migrated before each test file;
// - the web app (src/web) runs in a simulated browser (happy-dom), its components rendered by Testing Library.
export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    define: { __APP_COMMIT__: JSON.stringify('test') },
    // The same `@/` as the app (vite.config.ts), which the shadcn components import from.
    resolve: { alias: { '@': fileURLToPath(new URL('./src/web', import.meta.url)) } },
    test: {
      projects: [
        {
          extends: true,
          plugins: [
            cloudflareTest({
              wrangler: { configPath: './wrangler.jsonc' },
              // MIGRATION_DB replays the migrations one by one: each migration test starts from the schema it ran on.
              miniflare: { bindings: { TEST_MIGRATIONS: migrations }, d1Databases: ['MIGRATION_DB'] },
            }),
          ],
          test: {
            name: 'api',
            include: ['src/lib/**/*.test.ts', 'src/worker/**/*.test.ts', 'scripts/**/*.test.ts'],
            setupFiles: ['./src/test-setup.ts'],
          },
        },
        {
          extends: true,
          plugins: [react()],
          test: {
            name: 'web',
            include: ['src/web/**/*.test.{ts,tsx}'],
            environment: 'happy-dom',
            setupFiles: ['./src/web/test-setup.ts'],
          },
        },
      ],
    },
  };
});
