import { expect, test } from 'vitest';
import { databaseBefore, runMigration } from './migration-history';

// Replays migration 0015: manual declarations go, cards fall back to the rank source, closed months stay.

test('manual declarations are removed, and each card shows the latest rank source reading', async () => {
  const db = await databaseBefore('0015_');
  const snapshot = JSON.stringify({ month: '2026-10', status: 'final', losers: ['bob'], rows: [] });
  await db.batch([
    db.prepare(
      "INSERT INTO player_identities (slot, owner, player_id) VALUES ('alice', 'member-alice', 'Epic|alice-test|0'), ('bob', 'member-bob', 'Epic|bob-test|0')",
    ),
    db.prepare(
      `INSERT INTO mmr_entries (id, player, mmr, tier, division, author, recorded_at, source) VALUES
        ('alice-observer', 'alice', 1250, 17, 2, 'rank-source', '2026-11-02T10:00:00.000Z', 'observer'),
        ('alice-manual', 'alice', 1300, 18, 1, 'member-alice', '2026-11-03T10:00:00.000Z', 'manual'),
        ('bob-manual', 'bob', 1100, 16, 3, 'member-bob', '2026-11-04T10:00:00.000Z', 'manual')`,
    ),
    db.prepare(
      `INSERT INTO player_ranks (player, player_id, playlist, mmr, fetched_at, last_attempt, status) VALUES
        ('alice', 'Epic|alice-test|0', 11, 1300, '2026-11-03T10:00:00.000Z', '2026-11-03T10:00:00.000Z', 'manual'),
        ('bob', 'Epic|bob-test|0', 11, 1100, '2026-11-04T10:00:00.000Z', '2026-11-04T10:00:00.000Z', 'manual')`,
    ),
    db
      .prepare(
        "INSERT INTO monthly_mmr_results (month, cutoff_at, closed_at, status, snapshot) VALUES ('2026-10', '2026-10-31T23:00:00.000Z', '2026-10-31T23:05:00.000Z', 'final', ?)",
      )
      .bind(snapshot),
    db.prepare(
      "INSERT INTO drink_debts (id, month, payer, recipient) VALUES ('2026-10:bob:alice', '2026-10', 'bob', 'alice')",
    ),
  ]);

  await runMigration(db, '0015_');

  const entries = await db.prepare('SELECT id FROM mmr_entries ORDER BY id').all<{ id: string }>();
  expect(entries.results.map((entry) => entry.id)).toEqual(['alice-observer']);
  const ranks = await db.prepare('SELECT player, mmr, tier, division, status FROM player_ranks ORDER BY player').all();
  expect(ranks.results).toEqual([{ player: 'alice', mmr: 1250, tier: 17, division: 2, status: 'ready' }]);
  expect(await db.prepare('SELECT snapshot FROM monthly_mmr_results').first('snapshot')).toBe(snapshot);
  expect(await db.prepare('SELECT COUNT(*) AS n FROM drink_debts').first('n')).toBe(1);
});
