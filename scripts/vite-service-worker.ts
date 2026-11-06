import type { Plugin } from 'vite';

// Builds src/web/sw/service-worker.ts into /sw.js (a service worker must sit at the root of the pages it serves),
// with this build's file list written at its top: every deploy that changes a file changes sw.js, and the browser
// installs the new worker.

const source = '/src/web/sw/service-worker.ts';
const fileName = 'sw.js';

export interface WorkerBuild {
  version: string;
  files: string[];
}

/** The files the worker copies on install: the app shell and the build files, never source maps. */
export function precacheFiles(bundleFiles: string[]): string[] {
  const builtFiles = bundleFiles.filter((name) => name.startsWith('assets/') && !name.endsWith('.map'));
  return ['/', ...builtFiles.map((name) => `/${name}`).sort()];
}

/** A short name that changes with the file list. */
export async function buildVersion(files: string[]): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(files.join('\n')));
  return Array.from(new Uint8Array(digest).slice(0, 6), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function buildHeader(build: WorkerBuild): string {
  return `const __SW_BUILD__ = ${JSON.stringify(build)};\n`;
}

export function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    enforce: 'post',
    // In development the worker is served as a module straight from the source, with only the shell to copy.
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== `/${fileName}`) return next();
        try {
          const result = await server.environments.client.transformRequest(source);
          if (!result) return next();
          response.setHeader('Content-Type', 'text/javascript');
          response.setHeader('Cache-Control', 'no-cache');
          response.end(buildHeader({ version: 'dev', files: ['/'] }) + result.code);
        } catch (error) {
          next(error);
        }
      });
    },
    buildStart() {
      if (this.environment.name === 'client' && this.environment.mode === 'build') {
        this.emitFile({ type: 'chunk', id: source, fileName });
      }
    },
    async generateBundle(_, bundle) {
      if (this.environment.name !== 'client') return;
      const worker = bundle[fileName];
      if (worker?.type !== 'chunk') return this.error(`${fileName} is missing from the build.`);
      // A classic worker script cannot import: src/web/sw must not share a module with the app.
      if (worker.imports.length > 0) return this.error(`${fileName} imports ${worker.imports.join(', ')}.`);
      const files = precacheFiles(Object.keys(bundle));
      worker.code = buildHeader({ version: await buildVersion(files), files }) + worker.code;
    },
  };
}
