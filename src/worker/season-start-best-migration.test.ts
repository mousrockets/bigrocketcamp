import { expect, test } from 'vitest';
import { databaseBefore, runMigration } from './migration-history';

// Replays migration 0041 on duo and solo accounts read during season 24: the best before the season is the best as it stands
// when the season's peak did not reach it, and unknown when it did; every account is marked as read in season 24.

test('keeps the best before season 24 when the season did not reach it, and none when it did, duo and solo', async () => {
  const db = await databaseBefore('0041_');
  await db
    .prepare(
      `INSERT INTO solo_ranks
      (player, player_id, mmr, tier, division, fetched_at, status, season, peak_mmr, peak_tier, peak_division,
        best_mmr, best_tier, best_division)
    VALUES
      ('alice', 'Epic|alice-test|0', 1509, 19, 1, '2026-11-20T10:00:00.000Z', 'ready', 24, 1520, 19, 2, 1650, NULL, NULL),
      ('bob', 'Epic|bob-test|0', 1300, 17, 3, '2026-11-20T10:00:00.000Z', 'ready', 24, 1420, 18, 2, 1420, 18, 2),
      ('carla', 'Epic|carla-test|0', 1200, 16, 4, '2026-09-01T10:00:00.000Z', 'ready', 23, 1250, 17, 1, 1300, 17, 2),
      ('dan', NULL, NULL, NULL, NULL, NULL, 'not_found', NULL, NULL, NULL, NULL, NULL, NULL, NULL)`,
    )
    .run();
  await db
    .prepare(
      `INSERT INTO player_ranks
      (player, player_id, mmr, tier, division, fetched_at, last_attempt, status, season, peak_mmr, peak_tier,
        peak_division, best_mmr, best_tier, best_division)
    VALUES
      ('alice', 'Epic|alice-duo|0', 1300, 17, 2, '2026-11-20T10:00:00.000Z', '2026-11-20T10:00:00.000Z', 'ready', 24,
        1330, 17, 3, 1400, 18, 1),
      ('bob', 'Epic|bob-duo|0', 1350, 18, 1, '2026-11-20T10:00:00.000Z', '2026-11-20T10:00:00.000Z', 'ready', 24,
        1360, 18, 2, 1360, 18, 2)`,
    )
    .run();
  await runMigration(db, '0041_');
  const duo = await db
    .prepare('SELECT player, season_start_season, season_start_best_mmr FROM player_ranks ORDER BY player')
    .all();
  // The duo accounts follow the same rule: Alice's best is from before the season, Bob's was reached in it.
  expect(duo.results).toEqual([
    { player: 'alice', season_start_season: 24, season_start_best_mmr: 1400 },
    { player: 'bob', season_start_season: 24, season_start_best_mmr: null },
  ]);
  const after = await db
    .prepare(
      `SELECT player, season_start_season, season_start_best_mmr, season_start_best_tier, season_start_best_division
      FROM solo_ranks ORDER BY player`,
    )
    .all();
  expect(after.results).toEqual([
    // Set by hand above anything read this season: from before it.
    {
      player: 'alice',
      season_start_season: 24,
      season_start_best_mmr: 1650,
      season_start_best_tier: null,
      season_start_best_division: null,
    },
    // Reached this season: the one before is unknown.
    {
      player: 'bob',
      season_start_season: 24,
      season_start_best_mmr: null,
      season_start_best_tier: null,
      season_start_best_division: null,
    },
    // Not read yet this season: its best is from before.
    {
      player: 'carla',
      season_start_season: 24,
      season_start_best_mmr: 1300,
      season_start_best_tier: 17,
      season_start_best_division: 2,
    },
    {
      player: 'dan',
      season_start_season: 24,
      season_start_best_mmr: null,
      season_start_best_tier: null,
      season_start_best_division: null,
    },
  ]);
});
