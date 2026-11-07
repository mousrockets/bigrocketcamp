import { hc } from 'hono/client';
import { apiError } from '../lib/contract';
import { defaultTimeoutMs, fetchWithin } from '../lib/timeout';
import { type core, parseOrThrow } from '../lib/validation';
import type { AppType } from '../worker/app';
import { forgetEverything } from './persistence';

// Every call to the API goes through its typed client (Hono RPC): the routes, their inputs and their answers come
// from the Worker's own types, and each answer is parsed with its schema from src/lib/contract.

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

/** The session cookie goes with every call; the API answers `no-store`, the browser keeps nothing either. */
const init: RequestInit = { credentials: 'same-origin', cache: 'no-store' };
/** The client builds each address from its routes and hands it to fetch as a string. */
const addressOf = (input: RequestInfo | URL) => (input instanceof Request ? input.url : String(input));

/** The API for a signed-in member, each request given up after `timeoutMs`: the board's held request waits longer. */
export const apiWithin = (timeoutMs: number) =>
  hc<AppType>('/', {
    fetch: (input: RequestInfo | URL, request?: RequestInit) => apiFetch(addressOf(input), request, { timeoutMs }),
    init,
  }).api;

/** The API for a signed-in member. */
export const api = apiWithin(defaultTimeoutMs);

/** The API before any session (signing in, the club's name, the build): a 401 there says nothing of a lost session. */
export const guestApi = hc<AppType>('/', {
  fetch: (input: RequestInfo | URL, request?: RequestInit) => fetchWithin(fetch, addressOf(input), request),
  init,
}).api;

/** What the helpers read of an answer, typed by the client or not. */
interface Answer {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

/** The error message of an API answer, or a fallback. */
export async function errorOf(response: Answer, fallback: string): Promise<string> {
  try {
    const body = apiError.safeParse(await response.json());
    return (body.success && body.data.error) || fallback;
  } catch {
    return fallback;
  }
}

/** A write that answers nothing: a refusal throws the API's own message, or `fallback`. */
export async function sent(answer: Promise<Answer>, fallback: string): Promise<void> {
  const response = await answer;
  if (!response.ok) throw new Error(await errorOf(response, fallback));
}

/**
 * The answer's data, parsed with its schema from the contract: a field a newer API adds is kept. A refusal throws
 * the API's own message, an answer that breaks the contract `fallback`.
 */
export async function dataOf<Schema extends core.$ZodType>(
  answer: Promise<Answer>,
  schema: Schema,
  fallback: string,
): Promise<core.output<Schema>> {
  const response = await answer;
  if (!response.ok) throw new Error(await errorOf(response, fallback));
  return parseOrThrow(schema, await response.json(), fallback);
}

export async function signOut(): Promise<void> {
  try {
    await forgetEverything();
    await guestApi.auth.logout.$post();
  } finally {
    // Reloading shows the sign-in screen, or the same page if the request did not reach the server.
    location.reload();
  }
}
