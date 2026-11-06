/**
 * How the service worker answers a request:
 * - `network`: not touched at all (the API, sessions, anything that is not a plain read of this site);
 * - `page`: a page opening, network first, then the copy of the app shell;
 * - `immutable`: a build file, whose name changes with its content, read from the copy first;
 * - `fresh`: any other file of the site, network first, then its copy.
 */
export type Strategy = 'network' | 'page' | 'immutable' | 'fresh';

type RequestLike = Pick<Request, 'method' | 'mode' | 'url' | 'headers'>;

export const workerPath = '/sw.js';

export function strategyFor(request: RequestLike, origin: string): Strategy {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== origin) return 'network';
  // The API answers for the signed-in member: nothing of it, cookies and sessions included, is ever kept.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return 'network';
  // The browser checks the worker itself; a range request asks for part of a file, which a copy cannot answer.
  if (url.pathname === workerPath || request.headers.has('range')) return 'network';
  if (request.mode === 'navigate') return 'page';
  if (url.pathname.startsWith('/assets/')) return 'immutable';
  return 'fresh';
}
