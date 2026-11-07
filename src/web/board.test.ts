import { QueryClient } from '@tanstack/react-query';
import { afterEach, expect, test } from 'vitest';
import { emptyBoard, type SyncedBoard } from '../lib/board-sync';
import type { BoardChanges } from '../lib/contract';
import { boardQuery, playerStats } from './board';
import { aResult, boardWith } from './test-utils';

// The board query reads every page of what changed, and starts over when the board it holds is another member's.

const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
});

const changes = (parts: Partial<BoardChanges>): BoardChanges => ({
  viewer: 'viewer-alice',
  version: 1,
  more: false,
  reset: false,
  results: [],
  exercises: [],
  reactions: [],
  reactionsOf: [],
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
  rules: { lastPlace: [], forfeit: [], highScore: [] },
  ...parts,
});

const exercise = (id: string) => ({
  id,
  player: 'alice',
  type: 'pushups',
  count: 10,
  day: '2026-11-07',
  created: '2026-11-07T18:00:00.000Z',
  mine: true,
});

/** Answers each request with the next answer, and records the versions asked from. */
function serve(answers: BoardChanges[]) {
  const asked: string[] = [];
  globalThis.fetch = ((input: string) => {
    asked.push(new URL(input, 'http://app.test').searchParams.get('since') ?? '');
    const answer = answers.shift();
    return Promise.resolve(answer ? Response.json(answer) : new Response(null, { status: 204 }));
  }) as typeof fetch;
  return asked;
}

test('reads every page of what changed, from the version held', async () => {
  const asked = serve([
    changes({ version: 3, more: true, reset: true, exercises: [exercise('exercise-a-0000000001')] }),
    changes({ version: 5, exercises: [exercise('exercise-a-0000000002')] }),
  ]);
  const board = await new QueryClient().fetchQuery(boardQuery('member-alice'));
  expect(asked).toEqual(['0', '3']);
  expect(board.version).toBe(5);
  expect(Object.keys(board.exercises)).toEqual(['exercise-a-0000000001', 'exercise-a-0000000002']);
});

test('starts over when the board kept in the browser was another member’s', async () => {
  const client = new QueryClient();
  const query = boardQuery('member-alice');
  const kept: SyncedBoard = { ...emptyBoard(), version: 9, viewer: 'viewer-bob', exercises: { old: exercise('old') } };
  client.setQueryData(query.queryKey, kept);
  const asked = serve([changes({ version: 9 }), changes({ version: 4, reset: true })]);
  const board = await client.fetchQuery({ ...query, staleTime: 0 });
  expect(asked).toEqual(['9', '0']);
  expect(board.viewer).toBe('viewer-alice');
  expect(board.exercises).toEqual({});
});

test('counts each debt with the club’s rules of the match’s day, the −5 of a forfeit won included', () => {
  const won = (match_guid: string, day: string) =>
    aResult({ name: 'alice', match_guid, day, winner: 0, forfeit: true });
  const board = boardWith({ results: [won('before', '2026-11-06'), won('after', '2026-11-07')] });
  expect(playerStats(board, ['alice'])[0]?.due).toBe(-10);
  const rules = { ...board.rules, forfeit: [{ effectiveFrom: '2026-11-07', enabled: false }] };
  expect(playerStats({ ...board, rules }, ['alice'])[0]?.due).toBe(-5);
});

test('counts each debt with the −10 from 1000 points of the match’s day', () => {
  const game = (match_guid: string, day: string) => aResult({ name: 'alice', match_guid, day, score: 1100 });
  const board = boardWith({ results: [game('before', '2026-11-06'), game('first', '2026-11-07')] });
  expect(playerStats(board, ['alice'])[0]?.due).toBe(0);
  const rules = { ...board.rules, highScore: [{ effectiveFrom: '2026-11-07', enabled: false }] };
  expect(playerStats({ ...board, rules }, ['alice'])[0]?.due).toBe(10);
  // A board kept from an older API has no rule for it: the default one applies.
  const { highScore: _older, ...older } = board.rules;
  expect(playerStats({ ...board, rules: older as typeof board.rules }, ['alice'])[0]?.due).toBe(0);
});
