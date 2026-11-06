import { fileURLToPath } from 'node:url';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { serviceWorker } from './scripts/vite-service-worker.ts';

// Fixed ports, overridable for a one-off: a server that silently moves to the next free port is one nobody finds.
const devPort = Number(process.env.DEV_PORT ?? 10071);
const previewPort = Number(process.env.PREVIEW_PORT ?? 10072);
// Workers Builds names the commit it builds; a local build is "dev". The worker and the web app get the same value.
const commit = process.env.WORKERS_CI_COMMIT_SHA?.slice(0, 7) || 'dev';

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare(), serviceWorker()],
  define: { __APP_COMMIT__: JSON.stringify(commit) },
  resolve: { alias: { '@': fileURLToPath(new URL('./src/web', import.meta.url)) } },
  server: { host: '127.0.0.1', port: devPort, strictPort: true },
  preview: { host: '127.0.0.1', port: previewPort, strictPort: true },
});
