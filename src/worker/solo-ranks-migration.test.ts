import { expect, test } from 'vitest';
import { databaseBefore, runMigration } from './migration-history';

// Replays migration 0017: each card's season peak starts from the readings held, closed months stay.

test('each card gets the highest reading held as its season peak, and closed months stay as they were', async () => {
  const db = await databaseBefore('0017_');
  const snapshot = JSON.stringify({
    month: '2026-10',
    status: 'final',
    losers: ['bob'],
    rows: [
      { player: 'alice', mmr: 1250, recordedAt: '2026-10-31T21:00:00.000Z', confirmedForClose: true },
      { player: 'bob', mmr: 1100, recordedAt: '2026-10-31T20:00:00.000Z', confirmedForClose: true },
    ],
  });
  await db.batch([
    db.prepare(
      `INSERT INTO mmr_entries (id, player, mmr, tier, division, author, recorded_at, source) VALUES
        ('alice-1', 'alice', 1250, 17, 2, 'rank-source', '2026-11-02T10:00:00.000Z', 'observer'),
        ('alice-2', 'alice', 1310, 18, 1, 'rank-source', '2026-11-03T10:00:00.000Z', 'observer'),
        ('alice-3', 'alice', 1310, 18, 1, 'rank-source', '2026-11-04T10:00:00.000Z', 'observer'),
        ('alice-4', 'alice', 1290, 17, 4, 'rank-source', '2026-11-05T10:00:00.000Z', 'observer'),
        ('bob-1', 'bob', 1100, 16, 3, 'rank-source', '2026-11-04T10:00:00.000Z', 'observer')`,
    ),
    db.prepare(
      `INSERT INTO player_ranks (player, player_id, playlist, mmr, tier, division, fetched_at, last_attempt, status) VALUES
        ('alice', 'Epic|alice-test|0', 11, 1290, 17, 4, '2026-11-06T10:00:00.000Z', '2026-11-06T10:00:00.000Z', 'ready'),
        ('bob', 'Epic|bob-test|0', 11, 1100, 16, 3, '2026-11-06T10:00:00.000Z', '2026-11-06T10:00:00.000Z', 'ready'),
        ('carla', 'Epic|carla-test|0', 11, NULL, NULL, NULL, NULL, '2026-11-06T10:00:00.000Z', 'waiting')`,
    ),
    db
      .prepare(
        "INSERT INTO monthly_mmr_results (month, cutoff_at, closed_at, status, snapshot) VALUES ('2026-10', '2026-10-31T23:00:00.000Z', '2026-10-31T23:05:00.000Z', 'final', ?)",
      )
      .bind(snapshot),
    db.prepare(
      "INSERT INTO drink_debts (id, month, payer, recipient, paid_at, paid_by) VALUES ('2026-10:bob:alice', '2026-10', 'bob', 'alice', '2026-11-02T18:00:00.000Z', 'member-bob')",
    ),
  ]);
  const before = await db.batch([
    db.prepare('SELECT * FROM monthly_mmr_results'),
    db.prepare('SELECT * FROM drink_debts'),
    db.prepare('SELECT * FROM mmr_entries ORDER BY id'),
  ]);

  await runMigration(db, '0017_');

  const peaks = await db
    .prepare(
      'SELECT player, mmr, season, peak_mmr, peak_tier, peak_division, peak_at FROM player_ranks ORDER BY player',
    )
    .all();
  expect(peaks.results).toEqual([
    {
      player: 'alice',
      mmr: 1290,
      season: 24,
      peak_mmr: 1310,
      peak_tier: 18,
      peak_division: 1,
      peak_at: '2026-11-03T10:00:00.000Z',
    },
    {
      player: 'bob',
      mmr: 1100,
      season: 24,
      peak_mmr: 1100,
      peak_tier: 16,
      peak_division: 3,
      peak_at: '2026-11-04T10:00:00.000Z',
    },
    { player: 'carla', mmr: null, season: null, peak_mmr: null, peak_tier: null, peak_division: null, peak_at: null },
  ]);
  const after = await db.batch([
    db.prepare('SELECT * FROM monthly_mmr_results'),
    db.prepare('SELECT * FROM drink_debts'),
    db.prepare('SELECT * FROM mmr_entries ORDER BY id'),
  ]);
  expect(after.map((answer) => answer.results)).toEqual(before.map((answer) => answer.results));
});
