import { expect, test } from 'vitest';
import { readChallengeRules } from '../lib/club-rules';
import { summarize } from '../lib/domain';
import { defaultLastPlaceRules } from '../lib/match-rules';
import { databaseBefore, runMigration, runMigrationsFrom } from './migration-history';

// Replays migration 0021 on data shaped like production's: the +5 keeps counting exactly as the code did,
// nothing already stored moves, closed months and drinks first, and the board follows the new rules.

const snapshot = JSON.stringify({
  month: '2026-10',
  status: 'final',
  losers: ['bob'],
  rows: [
    { player: 'alice', mmr: 1250, recordedAt: '2026-10-31T21:00:00.000Z', confirmedForClose: true },
    { player: 'bob', mmr: 1100, recordedAt: '2026-10-31T20:00:00.000Z', confirmedForClose: true },
  ],
});

const kept = (db: D1Database) =>
  db.batch([
    db.prepare('SELECT * FROM members ORDER BY id'),
    db.prepare('SELECT * FROM club_settings'),
    db.prepare('SELECT * FROM exercises ORDER BY id'),
    db.prepare('SELECT * FROM monthly_mmr_results'),
    db.prepare('SELECT * FROM drink_debts'),
  ]);

/** A defeat of alice and bob together, bob with the fewest points, on a given day. */
const defeat = (guid: string, day: string) =>
  [
    { name: 'alice', score: 400 },
    { name: 'bob', score: 150 },
  ].map((player) => ({
    match_guid: guid,
    player_id: `Epic|${player.name}-test|0`,
    kind: 'match',
    day,
    team: 0,
    winner: 1,
    ...player,
  }));

test('the +5 counts as before, and nothing stored changes', async () => {
  const db = await databaseBefore('0021_');
  await db.batch([
    db.prepare(
      `INSERT INTO members (id, email, role, duo_pseudo, platform, roster_position) VALUES
        ('member-alice', 'alice@example.com', 'admin', 'alice', 'pc', 1),
        ('member-bob', 'bob@example.com', 'member', 'bob', 'xbox', 2)`,
    ),
    db.prepare("UPDATE club_settings SET name = 'Le Club Fictif' WHERE id = 1"),
    db.prepare(
      `INSERT INTO exercises (id, player, count, day, created, author, type) VALUES
        ('exercise-of-alice-0001', 'alice', 20, '2026-11-05', '2026-11-05T20:00:00.000Z', 'member-alice', 'pushups'),
        ('exercise-of-bob-000001', 'bob', 90, '2026-11-06', '2026-11-06T21:00:00.000Z', 'member-bob', 'plank')`,
    ),
    db
      .prepare(
        "INSERT INTO monthly_mmr_results (month, cutoff_at, closed_at, status, snapshot) VALUES ('2026-10', '2026-10-31T23:00:00.000Z', '2026-10-31T23:05:00.000Z', 'final', ?)",
      )
      .bind(snapshot),
    db.prepare(
      "INSERT INTO drink_debts (id, month, payer, recipient, paid_at, paid_by) VALUES ('2026-10:bob:alice', '2026-10', 'bob', 'alice', NULL, NULL)",
    ),
  ]);
  const before = await kept(db);

  await runMigration(db, '0021_');

  expect((await kept(db)).map((answer) => answer.results)).toEqual(before.map((answer) => answer.results));
  expect(await db.prepare('SELECT COUNT(*) AS n FROM club_logo').first('n')).toBe(0);

  // Today's code reads the database as the later migrations leave it.
  await runMigrationsFrom(db, '0022_');
  const { lastPlace, forfeit } = await readChallengeRules(db);
  expect(forfeit).toEqual([]);
  expect(lastPlace).toEqual(defaultLastPlaceRules);
  // The day before the rule, the defeat costs 5; from its day on, bob takes the +5.
  const rows = [...defeat('m-1105', '2026-11-05'), ...defeat('m-1106', '2026-11-06')];
  const due = (rules: typeof lastPlace) => summarize(['alice', 'bob'], rows, [], '', [], rules).map((p) => p.due);
  expect(due(lastPlace)).toEqual([10, 15]);
  expect(due(lastPlace)).toEqual(due(defaultLastPlaceRules));

  const version = async () => Number(await db.prepare('SELECT version FROM sync_state WHERE id = 1').first('version'));
  const start = await version();
  await db.prepare("INSERT INTO last_place_rules (effective_from, enabled) VALUES ('2099-01-01', 0)").run();
  expect(await version()).toBe(start + 1);
  await expect(
    db.prepare("UPDATE last_place_rules SET enabled = 0 WHERE effective_from = '2026-11-06'").run(),
  ).rejects.toThrow(/the past never changes/);
});
