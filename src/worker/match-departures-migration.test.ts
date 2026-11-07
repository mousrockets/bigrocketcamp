import { expect, test } from 'vitest';
import { databaseBefore, runMigration } from './migration-history';

// Replays migration 0027 on a match received before it: its rows keep every value and nobody left it, a departure
// received later asks for the match to be rebuilt, and the board follows a rebuild that learns one.

const version = async (db: D1Database) =>
  (await db.prepare('SELECT version FROM sync_state WHERE id = 1').first<{ version: number }>())?.version ?? 0;

test('a match received before departures keeps its rows, nobody left it, and the board follows a departure', async () => {
  const db = await databaseBefore('0027_');
  await db.batch([
    db.prepare(
      `INSERT INTO source_reports (id, match_guid, source_id, source_type, expected_players, players, received,
        time_seconds, overtime, clock_trace)
      VALUES ('report-1', 'older-match', 'live-alice', 'collector', 2, '[]', '2026-11-07T21:00:00.000Z', 0, 0, NULL)`,
    ),
    db.prepare(
      `INSERT INTO match_results (match_guid, player_id, name, day, kind, team, winner, score, goals, assists, saves,
        received, review_required, verification, source_types, selected_source, source_difference, expected_players,
        forfeit, overtime)
      VALUES ('older-match', 'Epic|alice-test|0', 'alice', '2026-11-07', 'match', 0, 0, 420, 2, 1, 3,
        '2026-11-07T21:00:00.000Z', 0, 'single', 'collector', 'collector', NULL, 2, 0, 0)`,
    ),
    db.prepare("UPDATE match_builds SET built_revision = revision WHERE match_guid = 'older-match'"),
  ]);
  const before = (await db.prepare('SELECT * FROM match_results').all()).results;
  await runMigration(db, '0027_');

  const after = (await db.prepare('SELECT * FROM match_results').all()).results;
  expect(after).toEqual(before.map((row) => ({ ...row, left_early: 0 })));
  expect(await db.prepare('SELECT opponents_gone FROM source_reports').first()).toEqual({ opponents_gone: null });

  await db
    .prepare(
      `INSERT INTO match_departures (id, match_guid, player_id, source_id, source_type, payload, received)
      VALUES ('departure-1', 'older-match', 'Epic|bob-test|0', 'live-bob', 'collector', '{}', '2026-11-07T21:01:00.000Z')`,
    )
    .run();
  expect(
    await db
      .prepare("SELECT revision > built_revision AS pending FROM match_builds WHERE match_guid = 'older-match'")
      .first(),
  ).toEqual({ pending: 1 });

  const held = await version(db);
  await db.prepare("UPDATE match_results SET left_early = 1 WHERE match_guid = 'older-match'").run();
  expect(await version(db)).toBe(held + 1);
  expect(await db.prepare('SELECT seq FROM match_results').first()).toEqual({ seq: held + 1 });
});
