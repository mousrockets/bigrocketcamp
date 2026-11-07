import { expect, test } from 'vitest';
import { prepareBoard, readFullBoard } from '../lib/board';
import { joinTestClub, players, roster } from '../lib/club-fixture';
import { observationWrites, readMerged } from '../lib/reconcile';
import { databaseBefore, runMigration, runMigrationsFrom } from './migration-history';

// Replays migration 0016 on data shaped like production's: closed months and drinks keep their values,
// existing rows get distinct versions, and every match already received is built on the first visit.

const closedSnapshot = JSON.stringify({
  month: '2026-10',
  status: 'final',
  losers: ['carla'],
  rows: [
    { player: 'alice', mmr: 1300, recordedAt: '2026-10-31T22:50:00.000Z', confirmedForClose: true },
    { player: 'carla', mmr: 1100, recordedAt: '2026-10-31T21:00:00.000Z', confirmedForClose: true },
  ],
});

test('the board migration keeps every value and builds every match already received', async () => {
  const db = await databaseBefore('0016_');
  await joinTestClub(db);
  const game = { day: '2026-11-04', kind: 'match', winner: 0, goals: 1, assists: 0, saves: 2 };
  const rows = [
    { ...game, matchGuid: 'live-match', playerId: 'Epic|alice-test|0', name: 'alice', team: 0, score: 300 },
    { ...game, matchGuid: 'live-match', playerId: 'Steam|opponent|0', name: 'Opponent', team: 1, score: 200 },
  ];
  const writes = await observationWrites(
    db,
    { rows, sourceId: 'live-alice', sourceType: 'collector' },
    '2026-11-04T21:00:00.000Z',
  );
  // Raw: the scoreboard as source_reports held it then; observationWrites writes the columns added since.
  const scoreboard = rows.map(({ matchGuid, playerId, ...row }) => ({
    match_guid: matchGuid,
    player_id: playerId,
    ...row,
  }));
  await db.batch([
    ...(writes as D1PreparedStatement[]),
    db
      .prepare(
        "INSERT INTO source_reports VALUES ('report-live-match', 'live-match', 'live-alice', 'collector', 2, ?, '2026-11-04T21:00:00.000Z')",
      )
      .bind(JSON.stringify(scoreboard)),
    db.prepare(
      "INSERT INTO results VALUES ('Old-Match', 'Epic|bob-test|0', 'bob', '2026-10-20', 'match', 0, 0, 250, 0, 1, 1, '2026-10-20T20:00:00.000Z')",
    ),
    db.prepare("INSERT INTO match_rosters VALUES ('Old-Match', 1, '2026-10-20T20:00:00.000Z')"),
    db.prepare(
      "INSERT INTO exercises (id, player, count, day, created, author, type) VALUES ('old-exercise-00000001', 'bob', 5, '2026-10-20', '2026-10-20T20:05:00.000Z', 'member-bob', 'pushups'), ('old-exercise-00000002', 'alice', 10, '2026-11-04', '2026-11-04T21:05:00.000Z', 'member-alice', 'plank')",
    ),
    db.prepare(
      "INSERT INTO exercise_reactions VALUES ('old-exercise-00000001', 'member-alice', '💪', '2026-10-20T20:06:00.000Z')",
    ),
    db
      .prepare(
        "INSERT INTO monthly_mmr_results VALUES ('2026-10', '2026-10-31T23:00:00.000Z', '2026-10-31T23:05:00.000Z', 'final', ?)",
      )
      .bind(closedSnapshot),
    db.prepare(
      "INSERT INTO drink_debts VALUES ('2026-10:carla:alice', '2026-10', 'carla', 'alice', '2026-11-02T10:00:00.000Z', 'member-carla')",
    ),
  ]);
  await runMigration(db, '0016_');

  const months = await db.prepare('SELECT * FROM monthly_mmr_results').all();
  expect(months.results).toEqual([
    {
      month: '2026-10',
      cutoff_at: '2026-10-31T23:00:00.000Z',
      closed_at: '2026-10-31T23:05:00.000Z',
      status: 'final',
      snapshot: closedSnapshot,
    },
  ]);
  const debts = await db.prepare('SELECT * FROM drink_debts').all();
  expect(debts.results).toEqual([
    {
      id: '2026-10:carla:alice',
      month: '2026-10',
      payer: 'carla',
      recipient: 'alice',
      paid_at: '2026-11-02T10:00:00.000Z',
      paid_by: 'member-carla',
    },
  ]);
  const versions = await db
    .prepare('SELECT seq FROM exercises UNION ALL SELECT seq FROM exercise_reactions')
    .all<{ seq: number }>();
  const seqs = versions.results.map((row) => row.seq);
  expect(new Set(seqs).size).toBe(3);
  const state = await db.prepare('SELECT version FROM sync_state').first<{ version: number }>();
  expect(Math.max(...seqs)).toBeLessThan(state?.version ?? 0);
  const builds = await db.prepare('SELECT match_guid FROM match_builds ORDER BY match_guid').all();
  expect(builds.results).toEqual([{ match_guid: 'live-match' }, { match_guid: 'old-match' }]);

  // The app reads the tables as the later migrations left them.
  await runMigrationsFrom(db, '0017_');
  await prepareBoard(db);
  const board = await readFullBoard({ db, memberId: 'member-alice', hasRankSource: false }, players);
  expect(board.results).toEqual((await readMerged(db, roster)).rows);
  expect(board.results.map((row) => row.match_guid).sort()).toEqual(['live-match', 'live-match', 'old-match']);
  expect(board.exercises.map((exercise) => [exercise.id, exercise.mine])).toEqual([
    ['old-exercise-00000002', true],
    ['old-exercise-00000001', false],
  ]);
  expect(board.reactions).toEqual([{ exercise_id: 'old-exercise-00000001', emoji: '💪', count: 1, mine: 1 }]);
});
