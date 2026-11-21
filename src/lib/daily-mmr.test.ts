import { env } from 'cloudflare:workers';
import { beforeEach, expect, test } from 'vitest';
import { roster } from './club-fixture';
import { dailyMmrChanges, readDailyMmr } from './daily-mmr';

// Each account's MMR change on the last day it was read: its last reading of the day minus the last one before.

const [first = '', second = ''] = roster;

const reading = (parts: {
  account?: 'duo' | 'solo';
  player?: string;
  player_id?: string | null;
  mmr: number;
  recorded_at: string;
}) => ({ account: 'duo' as const, player: first, player_id: null, ...parts });

test('an account never read before, or another solo account, changes nothing', () => {
  expect(
    dailyMmrChanges(
      [
        reading({ account: 'solo', player_id: 'epic|b|0', mmr: 600, recorded_at: '2026-11-07T20:00:00Z' }),
        reading({ player: second, mmr: 700, recorded_at: '2026-11-07T20:00:00Z' }),
      ],
      [reading({ account: 'solo', player_id: 'epic|a|0', mmr: 900, recorded_at: '2026-11-06T20:00:00Z' }), null],
    ),
  ).toEqual([]);
});

beforeEach(async () => {
  await env.DB.batch(['mmr_entries', 'solo_mmr_entries'].map((table) => env.DB.prepare(`DELETE FROM ${table}`)));
});

const duo = (id: string, player: string, mmr: number, at: string) =>
  env.DB.prepare('INSERT INTO mmr_entries (id,player,mmr,recorded_at) VALUES (?,?,?,?)').bind(id, player, mmr, at);
const solo = (id: string, mmr: number, at: string) =>
  env.DB.prepare('INSERT INTO solo_mmr_entries (id,player,player_id,mmr,recorded_at) VALUES (?,?,?,?,?)').bind(
    id,
    first,
    'Epic|solo|0',
    mmr,
    at,
  );

test('each account changes by its last reading of its last day minus the last one before that day', async () => {
  await env.DB.batch([
    duo('d1', first, 1000, '2026-09-01T20:00:00Z'),
    duo('d2', first, 1006, '2026-11-07T19:00:00Z'),
    duo('d3', first, 1012, '2026-11-07T22:30:00Z'),
    solo('s1', 800, '2026-11-05T20:00:00Z'),
    solo('s2', 791, '2026-11-06T20:00:00Z'),
    // 23:30 UTC is the 8th in Paris.
    duo('e1', second, 700, '2026-11-07T20:00:00Z'),
    duo('e2', second, 690, '2026-11-07T23:30:00Z'),
  ]);
  expect(await readDailyMmr(env.DB, roster)).toEqual([
    { player: first, day: '2026-11-06', duo: null, solo: -9 },
    { player: first, day: '2026-11-07', duo: 12, solo: null },
    { player: second, day: '2026-11-08', duo: -10, solo: null },
  ]);
});
