import { expect, test } from 'vitest';
import { databaseBefore, runMigration } from './migration-history';

// Replays migration 0038 on duo accounts read before it: each best rating starts from the highest reading held,
// every season, with the rank of that reading, and nothing else changes.

test('each duo account starts from its highest reading held, with its rank', async () => {
  const db = await databaseBefore('0038_');
  await db.batch([
    db.prepare(
      `INSERT INTO mmr_entries (id, player, mmr, tier, division, recorded_at) VALUES
        ('alice-1', 'alice', 1280, 17, 1, '2026-11-01T10:00:00.000Z'),
        ('carla-1', 'carla', 1450, 18, 4, '2026-06-01T10:00:00.000Z'),
        ('carla-2', 'carla', 1450, 19, 1, '2026-09-01T10:00:00.000Z'),
        ('carla-3', 'carla', 1330, 18, 1, '2026-11-02T10:00:00.000Z')`,
    ),
    db.prepare(
      `INSERT INTO player_ranks
        (player, player_id, mmr, tier, division, fetched_at, last_attempt, status, season, peak_mmr, peak_tier, peak_division)
      VALUES
        ('alice', 'Epic|alice-test|0', 1300, 17, 2, '2026-11-02T10:00:00.000Z', '2026-11-02T10:00:00.000Z', 'ready', 24, 1290, 17, 1),
        ('bob', 'Epic|bob-test|0', 1150, 16, 2, '2026-11-02T10:00:00.000Z', '2026-11-02T10:00:00.000Z', 'ready', 24, 1188, 16, 4),
        ('carla', 'Epic|carla-test|0', 1330, 18, 1, '2026-11-02T10:00:00.000Z', '2026-11-02T10:00:00.000Z', 'ready', 24, 1340, 18, 2),
        ('dan', 'Epic|dan-test|0', NULL, NULL, NULL, NULL, '2026-11-02T10:00:00.000Z', 'waiting', NULL, NULL, NULL, NULL)`,
    ),
  ]);
  const before = (await db.prepare('SELECT * FROM player_ranks ORDER BY player').all()).results;
  await runMigration(db, '0038_');

  const after = (await db.prepare('SELECT * FROM player_ranks ORDER BY player').all()).results;
  const bests = [
    { best_mmr: 1300, best_tier: 17, best_division: 2 }, // the current reading
    { best_mmr: 1188, best_tier: 16, best_division: 4 }, // the season peak
    { best_mmr: 1450, best_tier: 19, best_division: 1 }, // the newest reading of it in the history
    { best_mmr: null, best_tier: null, best_division: null }, // never read
  ];
  expect(after).toEqual(before.map((row, index) => ({ ...row, ...bests[index] })));
});
