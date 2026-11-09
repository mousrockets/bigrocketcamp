import { expect, test } from 'vitest';
import { databaseBefore, runMigration } from './migration-history';

// Replays migration 0028 on solo accounts read before it: each one's best rating starts from the highest reading
// held for that account, every season, and an account never read has none.

test('each solo account starts from its highest reading held, and one never read has no best', async () => {
  const db = await databaseBefore('0028_');
  await db.batch([
    db.prepare(
      `INSERT INTO solo_mmr_entries (id, player, player_id, mmr, tier, division, recorded_at) VALUES
        ('alice-old', 'alice', 'Epic|alice-old|0', 1700, 20, 1, '2026-09-01T10:00:00.000Z'),
        ('alice-1', 'alice', 'Epic|alice-test|0', 1480, 19, 2, '2026-09-02T10:00:00.000Z'),
        ('alice-2', 'alice', 'Epic|alice-test|0', 1420, 18, 4, '2026-11-02T10:00:00.000Z'),
        ('bob-1', 'bob', 'Epic|bob-test|0', 1100, 16, 3, '2026-11-04T10:00:00.000Z')`,
    ),
    db.prepare(
      `INSERT INTO solo_ranks (player, player_id, mmr, tier, division, fetched_at, status, season, peak_mmr) VALUES
        ('alice', 'Epic|alice-test|0', 1420, 18, 4, '2026-11-02T10:00:00.000Z', 'ready', 21, 1430),
        ('bob', 'Epic|bob-test|0', 1150, 16, 4, '2026-11-05T10:00:00.000Z', 'ready', 21, 1150),
        ('carla', NULL, NULL, NULL, NULL, NULL, 'not_found', NULL, NULL)`,
    ),
  ]);
  const before = (await db.prepare('SELECT * FROM solo_ranks ORDER BY player').all()).results;
  await runMigration(db, '0028_');

  const after = (await db.prepare('SELECT * FROM solo_ranks ORDER BY player').all()).results;
  expect(after).toEqual(before.map((row, index) => ({ ...row, best_mmr: [1480, 1150, null][index] })));
});
