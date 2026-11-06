import { expect, test } from 'vitest';
import type { BoardChanges } from '../lib/board';
import { timeoutMessage } from '../lib/timeout';
import { BoardClient } from './board-client';

// A board request that never answers is given up, and the board keeps following.

/** A server that never answers: the request only ends when its signal aborts it. */
const silent = (_input: unknown, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  });

const changes: BoardChanges = {
  viewer: 'viewer',
  version: 7,
  more: false,
  reset: true,
  results: [],
  exercises: [],
  reactions: [],
  reactionsOf: 'all',
  removed: { results: [], exercises: [] },
  collectors: [],
  doublesRanks: [],
  monthly: null as unknown as BoardChanges['monthly'],
  rankSource: null,
} as unknown as BoardChanges;

test('the board keeps following after a request that never answered', { timeout: 15_000 }, async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = ((input: unknown, init?: RequestInit) => {
    calls++;
    if (calls === 1) return silent(input, init);
    return Promise.resolve(Response.json(changes));
  }) as typeof fetch;
  const errors: string[] = [];
  let client: BoardClient | null = null;
  try {
    const published = new Promise<unknown>((resolve) => {
      client = new BoardClient([], resolve, (message) => errors.push(message), { timeoutMs: 50 });
      client.start();
    });
    expect(await published).toMatchObject({ results: [], exercises: [] });
    expect(errors).toEqual([timeoutMessage]);
    expect(calls).toBeGreaterThanOrEqual(2);
  } finally {
    (client as BoardClient | null)?.stop();
    globalThis.fetch = original;
  }
});
