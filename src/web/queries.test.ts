import { MutationObserver, onlineManager, QueryObserver } from '@tanstack/react-query';
import { afterEach, expect, test, vi } from 'vitest';
import { timeoutMessage } from '../lib/timeout';
import { isSignInRequired } from './api';
import { ApiError, clubQuery, deployedVersionQuery, identitiesQuery, livePlayersQuery, membersQuery } from './queries';
import { createQueryClient } from './query-client';
import { declareExercise } from './writes';

// The API's reads and writes through TanStack Query: nothing is retried behind the page's back,
// a request is tried even offline, and every call still gives up after its delay.

const original = globalThis.fetch;
let calls: string[] = [];

/** Answers every request with `answer`, and records them. */
function serve(answer: (path: string) => Response | Promise<Response>) {
  calls = [];
  globalThis.fetch = ((input: string) => {
    calls.push(input);
    return Promise.resolve(answer(input));
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = original;
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

const exercise = { id: 'exercise-1', player: 'chat-pris-tea', type: 'pushups' as const, count: 5, day: '2026-11-07' };

test('a write that fails is sent once: the cache never resends it', async () => {
  serve(() => Response.json({ error: 'Serveur indisponible.' }, { status: 503 }));
  const client = createQueryClient();
  const write = new MutationObserver(client, { mutationFn: declareExercise });
  await expect(write.mutate(exercise)).rejects.toThrow('Serveur indisponible.');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(calls).toEqual(['/api/exercise']);
});

test('a read that fails is asked once, then left to the page', async () => {
  serve(() => new Response(null, { status: 500 }));
  const client = createQueryClient();
  const observer = new QueryObserver(client, membersQuery);
  const failed = new Promise((resolve) => observer.subscribe((result) => result.isError && resolve(result.error)));
  expect(await failed).toEqual(Error('Liste des membres indisponible.'));
  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(calls).toEqual(['/api/members']);
});

test('a request is tried even when the browser says it is offline', async () => {
  serve(() => Response.json({ members: [] }));
  onlineManager.setOnline(false);
  expect(await createQueryClient().fetchQuery(membersQuery)).toEqual([]);
  expect(calls).toEqual(['/api/members']);
});

test('a read that never answers is given up after its delay', async () => {
  vi.useFakeTimers();
  globalThis.fetch = ((_input: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    })) as typeof fetch;
  const read = createQueryClient().fetchQuery(membersQuery);
  const outcome = expect(read).rejects.toThrow(timeoutMessage);
  await vi.advanceTimersByTimeAsync(15_000);
  await outcome;
});

test('the club fails while it does not answer, and is asked again on return only after a failure', async () => {
  serve(() => new Response(null, { status: 502 }));
  await expect(createQueryClient().fetchQuery(clubQuery)).rejects.toThrow();
  const refetchOnReturn = clubQuery.refetchOnWindowFocus as (query: { state: { status: string } }) => unknown;
  expect(refetchOnReturn({ state: { status: 'error' } })).toBe('always');
  expect(refetchOnReturn({ state: { status: 'success' } })).toBe(false);
});

test('the club is null once a sign-in is needed', async () => {
  serve(() => new Response(null, { status: 401 }));
  expect(await createQueryClient().fetchQuery(clubQuery)).toBeNull();
  expect(isSignInRequired()).toBe(true);
});

test('the deployed version keeps its last answer when the API names no commit', async () => {
  const client = createQueryClient();
  serve(() => Response.json({ status: 'ok', commit: 'a1b2c3d', deployedAt: '2026-11-07T10:00:00.000Z' }));
  expect(await client.fetchQuery(deployedVersionQuery)).toEqual({
    commit: 'a1b2c3d',
    deployedAt: '2026-11-07T10:00:00.000Z',
  });
  serve(() => Response.json({ status: 'ok' }));
  await expect(client.fetchQuery({ ...deployedVersionQuery, staleTime: 0 })).rejects.toThrow();
  expect(client.getQueryData(deployedVersionQuery.queryKey)).toMatchObject({ commit: 'a1b2c3d' });
});

test("a refused read of the identities carries the API's reason, for each page to word", async () => {
  serve(() => Response.json({ error: 'Réservé aux membres.' }, { status: 403 }));
  const failure = await createQueryClient()
    .fetchQuery(identitiesQuery)
    .catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(ApiError);
  expect(failure).toMatchObject({ status: 403, reason: 'Réservé aux membres.' });
});

test('an answer without players is refused', async () => {
  serve(() => Response.json({ players: 'chat-pris-tea' }));
  await expect(createQueryClient().fetchQuery(livePlayersQuery)).rejects.toThrow('Réponse de connexion invalide.');
});
