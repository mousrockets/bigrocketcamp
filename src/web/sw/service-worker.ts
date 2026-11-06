// The service worker: the installed app opens with a weak network or none, and never holds a version back.
// Pages are read from the network first, so a reload always gets the deployed version when the network answers;
// src/web/version.ts then reloads an outdated page as before, keeping the exercise form.

import { strategyFor } from './routes';
import { cacheFirst, copiesOf, type Network, networkFirst, shellKey } from './strategies';

/** Written at the top of sw.js by the build (scripts/vite-service-worker.ts): this build's files and their name. */
declare const __SW_BUILD__: { version: string; files: string[] };

const worker = self as unknown as ServiceWorkerGlobalScope;
const cachePrefix = 'app-';
const cacheName = `${cachePrefix}${__SW_BUILD__.version}`;

worker.addEventListener('install', (event) => {
  // A new worker takes over at once: pages come from the network first, so it can never hold a version back.
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) => cache.addAll(__SW_BUILD__.files))
      .then(() => worker.skipWaiting()),
  );
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name.startsWith(cachePrefix) && name !== cacheName).map((name) => caches.delete(name)),
        ),
      )
      .then(() => worker.clients.claim()),
  );
});

worker.addEventListener('fetch', (event) => {
  const strategy = strategyFor(event.request, worker.location.origin);
  if (strategy === 'network') return;
  const answer = caches.open(cacheName).then((cache) => {
    const network: Network = {
      cache: copiesOf(cache),
      fetcher: (request) => fetch(request),
      keepAlive: (work) => event.waitUntil(work),
    };
    if (strategy === 'immutable') return cacheFirst(event.request, network);
    if (strategy === 'page') return networkFirst(event.request, network, { key: shellKey, page: true });
    return networkFirst(event.request, network);
  });
  event.respondWith(answer);
});
