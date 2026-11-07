import { onlineManager, QueryClient } from '@tanstack/react-query';

/**
 * The app's cache of API answers. Every page keeps its own rhythm, as before TanStack Query:
 * - a request is tried even when the browser says it is offline, so that the page tells the member at once
 *   instead of waiting silently;
 * - nothing is retried behind the page's back: a read is asked again on the page's own events, and a write is
 *   never sent twice by the cache.
 */
export function createQueryClient(): QueryClient {
  // The cache believes it starts online: an app opened offline must say so, or the network's return asks nothing.
  if (globalThis.navigator?.onLine === false) onlineManager.setOnline(false);
  return new QueryClient({
    defaultOptions: {
      queries: { networkMode: 'always', retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false },
      mutations: { networkMode: 'always', retry: false },
    },
  });
}
