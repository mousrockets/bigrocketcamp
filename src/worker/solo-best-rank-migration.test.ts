import { expect, test } from 'vitest';
import { databaseBefore, runMigration } from './migration-history';

// Replays migration 0035 on solo accounts with a best rating: each one takes the rank of a reading of that rating,
// the current one, the season peak or the newest in its history, and a best set by hand keeps none.

test('each best rating takes the rank of a reading of it, and one set by hand keeps none', async () => {
  const db = await databaseBefore('0035_');
  await db.batch([
    db.prepare(
      `INSERT INTO solo_mmr_entries (id, player, player_id, mmr, tier, division, recorded_at) VALUES
        ('carla-1', 'carla', 'Epic|carla-test|0', 1610, 19, 2, '2026-06-01T10:00:00.000Z'),
        ('carla-2', 'carla', 'Epic|carla-test|0', 1610, 20, 1, '2026-09-01T10:00:00.000Z'),
        ('carla-3', 'carla', 'Epic|carla-test|0', 1480, 19, 2, '2026-11-02T10:00:00.000Z'),
        ('dan-old', 'dan', 'Epic|dan-old|0', 1700, 20, 3, '2026-08-01T10:00:00.000Z'),
        ('dan-1', 'dan', 'Epic|dan-test|0', 1300, 17, 3, '2026-11-03T10:00:00.000Z')`,
    ),
    db.prepare(
      `INSERT INTO solo_ranks
        (player, player_id, mmr, tier, division, fetched_at, status, season, peak_mmr, peak_tier, peak_division, best_mmr)
      VALUES
        ('alice', 'Epic|alice-test|0', 1509, 19, 1, '2026-11-02T10:00:00.000Z', 'ready', 21, 1490, 19, 1, 1509),
        ('bob', 'Epic|bob-test|0', 1150, 16, 4, '2026-11-05T10:00:00.000Z', 'ready', 21, 1188, 16, 4, 1188),
        ('carla', 'Epic|carla-test|0', 1480, 19, 2, '2026-11-02T10:00:00.000Z', 'ready', 21, 1480, 19, 2, 1610),
        ('dan', 'Epic|dan-test|0', 1300, 17, 3, '2026-11-03T10:00:00.000Z', 'ready', 21, 1300, 17, 3, 1700),
        ('eve', NULL, NULL, NULL, NULL, NULL, 'not_found', NULL, NULL, NULL, NULL, NULL)`,
    ),
  ]);
  const before = (await db.prepare('SELECT * FROM solo_ranks ORDER BY player').all()).results;
  await runMigration(db, '0035_');

  const after = (await db.prepare('SELECT * FROM solo_ranks ORDER BY player').all()).results;
  const ranks: [number | null, number | null][] = [
    [19, 1], // the current reading
    [16, 4], // the season peak
    [20, 1], // the newest reading of it in the history
    [null, null], // set by hand: dan's 1700 was read on another account
    [null, null], // no best
  ];
  expect(after).toEqual(
    before.map((row, index) => ({ ...row, best_tier: ranks[index]?.[0], best_division: ranks[index]?.[1] })),
  );
});
