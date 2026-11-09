import { expect, test } from 'vitest';
import { databaseBefore, runMigration } from './migration-history';

// Replays migration 0030 on profiles whose solo account the rank source already found: each one becomes a game ID
// its member confirmed, and an ID another player already holds stays theirs.

const aliceSolo = `Epic|${'A'.repeat(32)}|0`;
const bobSolo = `Epic|${'b'.repeat(32)}|0`;

test('each solo account found becomes its member’s confirmed game ID, and one already held stays put', async () => {
  const db = await databaseBefore('0030_');
  await db.batch([
    db
      .prepare(
        `INSERT INTO members (id, email, role, duo_pseudo, solo_pseudo, solo_player_id, platform, roster_position) VALUES
          ('member-alice', 'alice@example.com', 'admin', 'alice', 'Alice Solo', ?1, 'pc', 1),
          ('member-bob', 'bob@example.com', 'member', 'bob', 'Bob Solo', ?2, 'pc', 2),
          ('member-carla', 'carla@example.com', 'member', 'carla', 'Carla Solo', NULL, 'playstation', 3),
          ('member-dan', 'dan@example.com', 'member', NULL, NULL, NULL, NULL, NULL)`,
      )
      .bind(aliceSolo, bobSolo),
    db
      .prepare(
        `INSERT INTO player_identity_aliases (player_id, slot, confirmed_by, confirmed_at) VALUES
          ('Epic|alice-duo|0', 'alice', 'member-alice', '2026-11-01T10:00:00.000Z'),
          (?1, 'carla', 'member-carla', '2026-11-02T10:00:00.000Z')`,
      )
      .bind(bobSolo),
  ]);
  await runMigration(db, '0030_');

  const aliases = await db
    .prepare('SELECT player_id, slot, confirmed_by FROM player_identity_aliases ORDER BY slot, player_id')
    .all();
  expect(aliases.results).toEqual([
    { player_id: `Epic|${'a'.repeat(32)}|0`, slot: 'alice', confirmed_by: 'member-alice' },
    { player_id: 'Epic|alice-duo|0', slot: 'alice', confirmed_by: 'member-alice' },
    { player_id: bobSolo, slot: 'carla', confirmed_by: 'member-carla' },
  ]);
  const confirmedAt = await db
    .prepare('SELECT confirmed_at FROM player_identity_aliases WHERE slot = ? AND player_id <> ?')
    .bind('alice', 'Epic|alice-duo|0')
    .first<string>('confirmed_at');
  expect(confirmedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
});
