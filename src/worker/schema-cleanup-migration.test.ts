import { expect, test } from 'vitest';
import { prepareBoard, readFullBoard, readHead } from '../lib/board';
import { joinTestClub, players, roster } from '../lib/club-fixture';
import { observationWrites, readMerged } from '../lib/reconcile';
import { databaseBefore, runMigrationsFrom } from './migration-history';

// Replays migrations 0017 and 0018 on data shaped like production's: the retired columns go, the prototype's
// tables change name, and every value kept, closed months and drinks first, stays exactly the same.

const snapshot = JSON.stringify({
  month: '2026-10',
  status: 'final',
  losers: ['carla'],
  rows: [{ player: 'alice', mmr: 1300, recordedAt: '2026-10-31T22:50:00.000Z', confirmedForClose: true }],
});

async function rows(db: D1Database, sql: string) {
  return (await db.prepare(sql).all()).results;
}

/** What must not change, read with the names and columns both schemas share. */
const kept = (db: D1Database, prototypeResults: string, prototypeRosters: string) =>
  Promise.all([
    rows(db, 'SELECT * FROM monthly_mmr_results ORDER BY month'),
    rows(db, 'SELECT * FROM drink_debts ORDER BY id'),
    rows(db, 'SELECT id, player, mmr, tier, division, recorded_at FROM mmr_entries ORDER BY id'),
    rows(
      db,
      'SELECT player, player_id, mmr, tier, division, fetched_at, last_attempt, status, matches_played FROM player_ranks ORDER BY player',
    ),
    rows(db, 'SELECT slot, owner, player_id FROM player_identities ORDER BY slot'),
    rows(db, 'SELECT * FROM player_identity_aliases ORDER BY player_id'),
    rows(db, 'SELECT * FROM exercises ORDER BY id'),
    rows(
      db,
      'SELECT * FROM exercise_reactions WHERE exercise_id IN (SELECT id FROM exercises) ORDER BY exercise_id, author',
    ),
    rows(db, `SELECT * FROM ${prototypeResults} ORDER BY match_guid, player_id`),
    rows(db, `SELECT * FROM ${prototypeRosters} ORDER BY match_guid`),
    rows(db, 'SELECT * FROM result_observations ORDER BY id'),
    rows(db, 'SELECT * FROM match_results ORDER BY match_guid, player_id'),
  ]);

test('the cleanup keeps every value, and the board still follows every change', async () => {
  const db = await databaseBefore('0017_');
  await joinTestClub(db);
  const writes = await observationWrites(
    db,
    {
      rows: [
        {
          matchGuid: 'live-match',
          playerId: 'Epic|alice-test|0',
          name: 'alice',
          day: '2026-11-04',
          kind: 'match',
          team: 0,
          winner: 1,
          score: 300,
          goals: 1,
          assists: 0,
          saves: 2,
        },
      ],
      rosters: [],
      sourceId: 'live-alice',
      sourceType: 'collector',
    },
    '2026-11-04T21:00:00.000Z',
  );
  await db.batch([
    ...(writes as D1PreparedStatement[]),
    db.prepare(
      "INSERT INTO player_identities (slot, owner, player_id, last_sync, last_attempt, coverage) VALUES ('alice', 'member-alice', 'Epic|alice-test|0', '2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z', 'full'), ('bob', 'member-bob', 'Epic|bob-test|0', NULL, NULL, 'recent_only')",
    ),
    db.prepare(
      "INSERT INTO player_identity_aliases VALUES ('Epic|alice-test|0', 'alice', 'member-alice', '2026-10-01T10:00:00.000Z')",
    ),
    db.prepare(
      `INSERT INTO mmr_entries (id, player, mmr, tier, division, author, recorded_at, source, source_at, source_url) VALUES
        ('observer-1', 'alice', 1250, 17, 2, 'rank-source', '2026-11-02T10:00:00.000Z', 'observer', NULL, NULL),
        ('observer-2', 'alice', 1262, 17, 2, 'rank-source', '2026-11-03T10:00:00.000Z', 'observer', NULL, NULL)`,
    ),
    db.prepare(
      "INSERT INTO player_ranks (player, player_id, playlist, mmr, tier, division, placement_matches, fetched_at, last_attempt, status, matches_played) VALUES ('alice', 'Epic|alice-test|0', 11, 1262, 17, 2, NULL, '2026-11-03T10:00:00.000Z', '2026-11-03T10:00:00.000Z', 'ready', 412)",
    ),
    db.prepare(
      "INSERT INTO exercises (id, player, count, day, created, author, type) VALUES ('kept-exercise-00000001', 'bob', 5, '2026-10-20', '2026-10-20T20:05:00.000Z', 'member-bob', 'pushups'), ('kept-exercise-00000002', 'alice', 90, '2026-11-04', '2026-11-04T21:05:00.000Z', 'member-alice', 'plank')",
    ),
    db.prepare(
      "INSERT INTO exercise_reactions (exercise_id, author, emoji, created) VALUES ('kept-exercise-00000001', 'member-alice', '💪', '2026-10-20T20:06:00.000Z'), ('removed-exercise-0001', 'member-bob', '🔥', '2026-10-19T20:06:00.000Z')",
    ),
    db.prepare(
      "INSERT INTO results VALUES ('Old-Match', 'Epic|bob-test|0', 'bob', '2026-10-20', 'match', 0, 0, 250, 0, 1, 1, '2026-10-20T20:00:00.000Z')",
    ),
    db.prepare("INSERT INTO match_rosters VALUES ('Old-Match', 1, '2026-10-20T20:00:00.000Z')"),
    db
      .prepare(
        "INSERT INTO monthly_mmr_results VALUES ('2026-10', '2026-10-31T23:00:00.000Z', '2026-10-31T23:05:00.000Z', 'final', ?)",
      )
      .bind(snapshot),
    db.prepare(
      "INSERT INTO drink_debts VALUES ('2026-10:carla:alice', '2026-10', 'carla', 'alice', '2026-11-02T10:00:00.000Z', 'member-carla'), ('2026-10:carla:bob', '2026-10', 'carla', 'bob', NULL, NULL)",
    ),
  ]);
  const before = await kept(db, 'results', 'match_rosters');

  await runMigrationsFrom(db, '0017_');

  expect(await kept(db, 'prototype_results', 'prototype_match_rosters')).toEqual(before);
  // Only the reaction to an exercise that no longer exists went.
  expect(await rows(db, 'SELECT exercise_id FROM exercise_reactions')).toEqual([
    { exercise_id: 'kept-exercise-00000001' },
  ]);
  const columns = async (table: string) =>
    (await rows(db, `PRAGMA table_info(${table})`)).map((column) => (column as { name: string }).name);
  expect(await columns('mmr_entries')).toEqual(['id', 'player', 'mmr', 'tier', 'division', 'recorded_at']);
  expect(await columns('player_identities')).toEqual(['slot', 'owner', 'player_id']);
  expect(await columns('player_ranks')).not.toContain('playlist');

  // The board still sees every change: a new reaction, an exercise taken back with its reaction, a prototype row.
  const version = (await readHead(db)).version;
  await db
    .prepare(
      "INSERT INTO exercise_reactions (exercise_id, author, emoji, created) VALUES ('kept-exercise-00000002', 'member-bob', '😂', '2026-11-05T10:00:00.000Z')",
    )
    .run();
  expect((await readHead(db)).version).toBeGreaterThan(version);
  await db.prepare("DELETE FROM exercises WHERE id = 'kept-exercise-00000001'").run();
  expect(
    await rows(db, "SELECT key FROM sync_removals WHERE collection = 'reactions' AND key = 'kept-exercise-00000001'"),
  ).toEqual([{ key: 'kept-exercise-00000001' }]);
  await db
    .prepare(
      "INSERT INTO prototype_results VALUES ('Old-Match', 'Steam|old|0', 'Old opponent', '2026-10-20', 'match', 1, 0, 330, 2, 0, 0, '2026-10-20T20:00:00.000Z')",
    )
    .run();
  expect((await readHead(db)).pending).toBe(true);
  await prepareBoard(db);
  const board = await readFullBoard({ db, memberId: 'member-alice', hasRankSource: false }, players);
  expect(board.results).toEqual((await readMerged(db, roster)).rows);
  expect(board.results.filter((row) => row.match_guid === 'old-match')).toHaveLength(2);
});
