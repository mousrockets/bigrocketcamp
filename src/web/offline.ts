// Not imported from src/web/sw: the worker must share no module with the app (see scripts/vite-service-worker.ts).
const workerPath = '/sw.js';

/** Registers the service worker (src/web/sw), which lets the installed app open with a weak network or none. */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  // Once the page has loaded: a first visit downloads the app before its offline copy.
  addEventListener(
    'load',
    () => {
      navigator.serviceWorker
        // In development, Vite serves the worker as a module straight from the source.
        .register(workerPath, { scope: '/', type: import.meta.env.DEV ? 'module' : 'classic', updateViaCache: 'none' })
        .catch((error: unknown) =>
          console.warn('Service worker not registered: the app will not open offline.', error),
        );
    },
    { once: true },
  );
}
