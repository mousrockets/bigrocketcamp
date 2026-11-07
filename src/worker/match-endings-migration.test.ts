import { expect, test } from 'vitest';
import { databaseBefore, runMigration } from './migration-history';

// Replays migration 0022 on a match received before it: its rows keep every value and learn nothing about how
// it ended, and the board follows a rebuild that later learns it.

const version = async (db: D1Database) =>
  (await db.prepare('SELECT version FROM sync_state WHERE id = 1').first<{ version: number }>())?.version ?? 0;

test('a match received before the clock keeps its rows, its ending unknown, and the board follows it', async () => {
  const db = await databaseBefore('0022_');
  await db.batch([
    db.prepare(
      `INSERT INTO source_reports (id, match_guid, source_id, source_type, expected_players, players, received)
      VALUES ('report-1', 'older-match', 'live-alice', 'collector', 2, '[]', '2026-11-06T21:00:00.000Z')`,
    ),
    db.prepare(
      `INSERT INTO match_results (match_guid, player_id, name, day, kind, team, winner, score, goals, assists, saves,
        received, review_required, verification, source_types, selected_source, source_difference, expected_players)
      VALUES ('older-match', 'Epic|alice-test|0', 'alice', '2026-11-06', 'match', 0, 0, 420, 2, 1, 3,
        '2026-11-06T21:00:00.000Z', 0, 'single', 'collector', 'collector', NULL, 2)`,
    ),
  ]);
  const before = (await db.prepare('SELECT * FROM match_results').all()).results;
  await runMigration(db, '0022_');

  const after = (await db.prepare('SELECT * FROM match_results').all()).results;
  expect(after).toEqual(before.map((row) => ({ ...row, forfeit: null, overtime: null })));
  expect(await db.prepare('SELECT time_seconds, overtime FROM source_reports').first()).toEqual({
    time_seconds: null,
    overtime: null,
  });

  const held = await version(db);
  await db.prepare("UPDATE match_results SET forfeit = 1, overtime = 0 WHERE match_guid = 'older-match'").run();
  expect(await version(db)).toBe(held + 1);
  expect(await db.prepare('SELECT seq FROM match_results').first()).toEqual({ seq: held + 1 });
});
