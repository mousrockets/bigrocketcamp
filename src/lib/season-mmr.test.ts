import { env } from 'cloudflare:workers';
import { beforeEach, expect, test } from 'vitest';
import { roster } from './club-fixture';
import { readSeasonMmr } from './season-mmr';

// Each account's MMR over each season: S23 from 10 June, S24 from 23 September 2026 at 16:00 UTC.

const [first = '', second = ''] = roster;

beforeEach(async () => {
  await env.DB.batch(['mmr_entries', 'solo_mmr_entries'].map((table) => env.DB.prepare(`DELETE FROM ${table}`)));
});

const duo = (id: string, player: string, mmr: number, at: string, tier: number | null = null) =>
  env.DB.prepare('INSERT INTO mmr_entries (id,player,mmr,tier,division,recorded_at) VALUES (?,?,?,?,?,?)').bind(
    id,
    player,
    mmr,
    tier,
    tier === null ? null : 1,
    at,
  );
const solo = (id: string, mmr: number, at: string) =>
  env.DB.prepare('INSERT INTO solo_mmr_entries (id,player,player_id,mmr,recorded_at) VALUES (?,?,?,?,?)').bind(
    id,
    first,
    'Epic|solo|0',
    mmr,
    at,
  );

test('reads each season’s first, last and highest rating, a reading going to the season it was made in', async () => {
  await env.DB.batch([
    duo('a', first, 1100, '2026-08-01T20:00:00.000Z'),
    duo('b', first, 1250, '2026-09-01T20:00:00.000Z', 17),
    duo('c', first, 1180, '2026-09-23T15:59:59.000Z'),
    // The new season: a soft reset, a climb past the old peak, then a bad evening.
    duo('d', first, 1150, '2026-09-23T16:00:00.000Z'),
    duo('e', first, 1310, '2026-10-20T21:00:00.000Z', 18),
    duo('f', first, 1160, '2026-11-20T21:00:00.000Z'),
    duo('g', second, 900, '2026-11-02T20:00:00.000Z'),
    solo('h', 1400, '2026-11-03T20:00:00.000Z'),
    solo('i', 1420, '2026-11-04T20:00:00.000Z'),
    // Before the first season listed: no season.
    duo('z', second, 700, '2026-01-01T20:00:00.000Z'),
  ]);
  const seasons = await readSeasonMmr(env.DB, roster);
  expect(
    seasons.map(({ player, account, season, first: start, last, peak }) => [
      player,
      account,
      season,
      start,
      last,
      peak.mmr,
    ]),
  ).toEqual([
    [first, 'duo', 24, 1150, 1160, 1310],
    [first, 'solo', 24, 1400, 1420, 1420],
    [second, 'duo', 24, 900, 900, 900],
    [first, 'duo', 23, 1100, 1180, 1250],
  ]);
  expect(seasons[0]?.peak).toMatchObject({ tier: 18, label: expect.stringContaining('Champion') });
});
