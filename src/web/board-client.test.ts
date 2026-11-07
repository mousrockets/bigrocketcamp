import { expect, test } from 'vitest';
import type { BoardChanges } from '../lib/contract';
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
  monthly: {
    startsMonth: '2026-11',
    current: {
      month: '2026-11',
      startAt: '2026-10-31T23:00:00.000Z',
      lastDay: '2026-11-30',
      lastDayStartAt: '2026-11-29T23:00:00.000Z',
      cutoffAt: '2026-11-30T23:00:00.000Z',
      rows: [],
      status: 'live',
      missing: [],
    },
    closed: [],
    allowedPlayers: [],
    debts: [],
  },
  rankSource: null,
  rules: { lastPlace: [] },
};

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
