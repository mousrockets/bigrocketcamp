import { fileURLToPath } from 'node:url';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Fixed ports, overridable for a one-off: a server that silently moves to the next free port is one nobody finds.
const devPort = Number(process.env.DEV_PORT ?? 10071);
const previewPort = Number(process.env.PREVIEW_PORT ?? 10072);

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src/web', import.meta.url)) } },
  server: { host: '127.0.0.1', port: devPort, strictPort: true },
  preview: { host: '127.0.0.1', port: previewPort, strictPort: true },
});
