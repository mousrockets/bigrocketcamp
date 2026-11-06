import { defaultTimeoutMs, fetchWithin } from '../lib/timeout';
import { forgetBoard } from './board-store';

// Any /api/* call can answer 401 once the session cookie is missing or expired. The pages keep their own
// error handling; this module only remembers that a sign-in is needed so that the app can show the sign-in screen.
let signInRequired = false;
const listeners = new Set<() => void>();

/** A call to the API, given up after `timeoutMs` (15 s by default) so that no request freezes the page. */
export async function apiFetch(
  path: string,
  init?: RequestInit,
  { timeoutMs = defaultTimeoutMs }: { timeoutMs?: number } = {},
): Promise<Response> {
  const response = await fetchWithin(fetch, path, init, timeoutMs);
  if (response.status === 401 && !signInRequired) {
    signInRequired = true;
    for (const listener of listeners) listener();
  }
  return response;
}

export function subscribeToSignInRequired(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isSignInRequired(): boolean {
  return signInRequired;
}

export async function signOut(): Promise<void> {
  try {
    await forgetBoard();
    await fetchWithin(fetch, '/api/auth/logout', { method: 'POST' });
  } finally {
    // Reloading shows the sign-in screen, or the same page if the request did not reach the server.
    location.reload();
  }
}
