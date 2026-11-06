import { expect, test } from 'vitest';
import { liveBridge } from './live-bridge';
import { fetchWithin, timeoutMessage } from './timeout';

// A request that never answers must not freeze the page: it is given up, and the next one goes out.

/** A server that never answers: the request only ends when its signal aborts it. */
const silent = (_input: unknown, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  });

test('a request that never answers is given up with a French message, an aborted one stays an abort', async () => {
  await expect(fetchWithin(silent as typeof fetch, '/api/state', {}, 30)).rejects.toThrow(timeoutMessage);
  const controller = new AbortController();
  const request = fetchWithin(silent as typeof fetch, '/api/state', { signal: controller.signal }, 5000);
  controller.abort();
  await expect(request).rejects.not.toThrow(timeoutMessage);
});

function finishedMatch() {
  const now = Date.now();
  const players = [
    ['alice', 'Epic|alice-timeout-test|0', 0],
    ['Teammate', 'Steam|76561190000000001|0', 0],
    ['Opponent 1', 'Steam|76561190000000002|0', 1],
    ['Opponent 2', 'Steam|76561190000000003|0', 1],
  ].map(([Name, PrimaryId, TeamNum]) => ({ Name, PrimaryId, TeamNum, Score: 100, Goals: 0, Assists: 0, Saves: 0 }));
  return {
    startedAt: now - 360_000,
    endedAt: now - 1000,
    seenIds: players.map((player) => player.PrimaryId),
    end: { MatchGuid: 'timeout-test-match', WinnerTeamNum: 0 },
    state: {
      MatchGuid: 'timeout-test-match',
      Players: players,
      Game: {
        PlaylistId: 11,
        Teams: [
          { Name: 'Blue', TeamNum: 0, Score: 2 },
          { Name: 'Orange', TeamNum: 1, Score: 1 },
        ],
        bHasWinner: true,
        bReplay: false,
        Winner: 'Blue',
      },
    },
  };
}

test('the Direct page sends again after a send that never answered', async () => {
  const storage = new Map([['rl-live-queue-v1', JSON.stringify([finishedMatch()])]]);
  const retries: (() => void)[] = [];
  const statuses: Record<string, unknown>[] = [];
  let calls = 0;
  let markReceived = () => {};
  const received = new Promise<void>((resolve) => {
    markReceived = resolve;
  });
  let markWaiting = () => {};
  const waiting = new Promise<void>((resolve) => {
    markWaiting = resolve;
  });
  type Options = NonNullable<Parameters<typeof liveBridge>[0]>;
  const bridge = liveBridge({
    WebSocketType: class {
      close() {}
    } as unknown as Options['WebSocketType'],
    storage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    } as unknown as Options['storage'],
    schedule: ((fn: () => void) => {
      retries.push(fn);
      return retries.length;
    }) as unknown as Options['schedule'],
    cancel: () => {},
    timeoutMs: 30,
    onStatus: (patch: Record<string, unknown>) => {
      statuses.push(patch);
      if (patch.message === 'Envoi en attente de connexion Internet.') markWaiting();
      if (patch.lastReceived) markReceived();
    },
    fetcher: ((input: unknown, init?: RequestInit) => {
      calls++;
      if (calls === 1) return silent(input, init);
      return Promise.resolve(Response.json({ ok: true, match: 'timeout-test-match', received: 4 }));
    }) as typeof fetch,
  } as unknown as Options);
  try {
    bridge.start();
    await waiting;
    // The send that never answered let go of the queue: the scheduled retry sends the match.
    for (const retry of retries.splice(0)) retry();
    await received;
    expect(calls).toBe(2);
    expect(JSON.parse(storage.get('rl-live-queue-v1') ?? '[]')).toEqual([]);
  } finally {
    bridge.stop();
  }
});
