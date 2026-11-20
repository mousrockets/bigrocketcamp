// The service worker: the installed app opens with a weak network or none, and never holds a version back.
// Pages are read from the network first, so a reload always gets the deployed version when the network answers;
// src/web/version.ts then reloads an outdated page as before, keeping the exercise form. It also shows the daily
// reminder (reminder.ts).

import { notificationOf, optOutOf, optOutPath, reminderOf, stopAction } from './reminder';
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

worker.addEventListener('push', (event) => {
  let data: unknown = null;
  try {
    data = event.data?.json();
  } catch {
    // Not a reminder of the club: nothing to show.
  }
  const push = reminderOf(data);
  if (push) event.waitUntil(worker.registration.showNotification(...notificationOf(push)));
});

worker.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(event.action === stopAction ? stopReminders() : openPage(event.notification.data?.url ?? '/'));
});

/** « Ne plus me rappeler »: the API forgets this device, then the browser drops its subscription. */
async function stopReminders() {
  const subscription = await worker.registration.pushManager.getSubscription();
  const proof = subscription && optOutOf(subscription);
  if (!subscription || !proof) return;
  // The service worker has no session nor the app's typed client: the endpoint and its secret are the proof.
  const response = await fetch(optOutPath, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(proof),
  }).catch(() => null);
  if (response?.ok) await subscription.unsubscribe();
}

/** The app's page the reminder points to, in the window already open if there is one. */
async function openPage(path: string) {
  const url = new URL(path, worker.location.origin).href;
  const [open] = await worker.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (!open) return worker.clients.openWindow(url);
  await open.focus();
  return open.navigate(url);
}
