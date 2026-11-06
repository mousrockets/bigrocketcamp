import { env } from 'cloudflare:workers';
import { beforeEach, expect, test } from 'vitest';
import { type BoardReader, prepareBoard, readBoardChanges, readFullBoard, readHead } from './board';
import { applyChanges, boardView, emptyBoard } from './board-sync';
import { joinTestClub, players, roster } from './club-fixture';
import { buildMatches } from './match-builds';
import { unassignedPrefix } from './player-identities';
import { observationWrites, readMerged } from './reconcile';

const db = env.DB;
const reader: BoardReader = { db, memberId: 'member-alice', hasRankSource: false };
const [alice = '', bob = '', carla = ''] = roster;
const ids = { alice: 'Epic|alice-test|0', bob: 'Epic|bob-test|0', carla: 'PS4|carla-test|0' };

const tables = [
  'result_observations',
  'source_reports',
  'prototype_results',
  'prototype_match_rosters',
  'match_results',
  'match_builds',
  'sync_removals',
  'exercises',
  'exercise_reactions',
  'player_identities',
  'player_identity_aliases',
  'collectors',
];

beforeEach(async () => {
  await db.batch(tables.map((table) => db.prepare(`DELETE FROM ${table}`)));
  await db.prepare('UPDATE sync_state SET match_basis = NULL').run();
  await joinTestClub(db);
  await db.batch(
    (['alice', 'bob', 'carla'] as const).map((slot) =>
      db
        .prepare('INSERT INTO player_identity_aliases VALUES (?, ?, ?, ?)')
        .bind(ids[slot], slot, `member-${slot}`, 'synthetic'),
    ),
  );
});

interface Line {
  name: string;
  playerId: string;
  team: number;
  score: number;
}

/** What the live route stores for one collector's view of a match. */
async function receive(guid: string, source: string, lines: Line[], { day = '2026-11-05', winner = 0, at = '' } = {}) {
  const rows = lines.map((line) => ({
    matchGuid: guid,
    day,
    kind: 'match',
    winner,
    goals: 0,
    assists: 0,
    saves: 0,
    ...line,
  }));
  const writes = await observationWrites(
    db,
    { rows, rosters: [{ matchGuid: guid, playerCount: lines.length }], sourceId: source, sourceType: 'collector' },
    at || new Date().toISOString(),
  );
  await db.batch(writes as D1PreparedStatement[]);
}

const team = (score = 300): Line[] => [
  { name: alice, playerId: ids.alice, team: 0, score },
  { name: bob, playerId: ids.bob, team: 0, score: score - 50 },
  { name: 'Opponent A', playerId: 'Steam|opponent-a', team: 1, score: 200 },
  { name: 'Opponent B', playerId: 'Steam|opponent-b', team: 1, score: 150 },
];

/** Several matches, two collectors that agree or disagree, a namesake, and a match from the prototype. */
async function seedHistory() {
  await receive('match-agreed', 'live-alice', team(), { at: '2026-11-05T20:00:00.000Z' });
  await receive('match-agreed', 'live-bob', team(), { at: '2026-11-05T20:00:01.000Z' });
  await receive('match-stats', 'live-alice', team(320), { at: '2026-11-05T20:10:00.000Z' });
  await receive('match-stats', 'live-bob', team(310), { at: '2026-11-05T20:10:02.000Z' });
  await receive('match-outcome', 'live-alice', team(), { winner: 0, at: '2026-11-05T20:20:00.000Z' });
  await receive('match-outcome', 'live-bob', team(), { winner: 1, at: '2026-11-05T20:20:01.000Z' });
  await receive(
    'match-namesake',
    'live-carla',
    [
      { name: unassignedPrefix + carla, playerId: 'PS4|carla-second|0', team: 0, score: 100 },
      { name: 'Opponent C', playerId: 'Steam|opponent-c', team: 1, score: 400 },
    ],
    { day: '2026-11-04', at: '2026-11-04T21:00:00.000Z' },
  );
  await db.batch([
    db
      .prepare(
        "INSERT INTO prototype_results VALUES ('Prototype-MATCH', ?, ?, '2026-10-30', 'match', 0, 1, 280, 1, 0, 2, '2026-10-30T21:00:00.000Z')",
      )
      .bind(ids.alice, alice),
    db
      .prepare(
        "INSERT INTO prototype_results VALUES ('Prototype-MATCH', 'Steam|old', 'Old opponent', '2026-10-30', 'match', 1, 1, 330, 2, 0, 0, '2026-10-30T21:00:00.000Z')",
      )
      .bind(),
    db.prepare("INSERT INTO prototype_match_rosters VALUES ('Prototype-MATCH', 2, '2026-10-30T21:00:00.000Z')"),
  ]);
  await db.batch(
    [
      ['exercise-alice-0000001', alice, 'member-alice', '2026-11-05T20:30:00.000Z'],
      ['exercise-bob-000000001', bob, 'member-bob', '2026-11-05T20:31:00.000Z'],
      ['exercise-alice-0000002', bob, 'member-alice', '2026-11-05T20:32:00.000Z'],
    ].map(([id, player, author, created]) =>
      db
        .prepare(
          "INSERT INTO exercises (id, player, count, day, created, author, type) VALUES (?, ?, 10, '2026-11-05', ?, ?, 'pushups')",
        )
        .bind(id, player, created, author),
    ),
  );
  await db.batch([
    db.prepare("INSERT INTO exercise_reactions VALUES ('exercise-bob-000000001', 'member-alice', '💪', 'x', 0)"),
    db.prepare("INSERT INTO exercise_reactions VALUES ('exercise-bob-000000001', 'member-carla', '💪', 'x', 0)"),
    db.prepare("INSERT INTO exercise_reactions VALUES ('exercise-alice-0000001', 'member-bob', '🔥', 'x', 0)"),
  ]);
}

/** The board a page holds after reading every page of changes since `board.version`. */
async function catchUp(board = emptyBoard(), limit = 3) {
  for (let pages = 0; pages < 50; pages++) {
    const { players: club, pending } = await prepareBoard(db);
    const changes = await readBoardChanges(reader, club, board.version, { limit, pending });
    applyChanges(board, changes);
    if (!changes.more) return board;
  }
  throw new Error('the board never caught up');
}

const sorted = <T extends { exercise_id: string; emoji: string }>(reactions: T[]) =>
  [...reactions].sort((a, b) => a.exercise_id.localeCompare(b.exercise_id) || a.emoji.localeCompare(b.emoji));

async function expectSameBoard(board: ReturnType<typeof emptyBoard>) {
  const full = await readFullBoard(reader, players);
  const view = boardView(board, roster);
  expect(view.results).toEqual(full.results);
  expect(view.exercises).toEqual(full.exercises);
  expect(view.matchRosters).toEqual(full.matchRosters);
  expect(view.reliability).toEqual(full.reliability);
  expect(sorted(view.reactions)).toEqual(sorted(full.reactions));
  expect(view.me).toEqual(full.me);
  expect(view.doublesRanks).toEqual(full.doublesRanks);
  expect(view.monthly).toEqual(full.monthly);
}

test('stored match results equal the reconciliation of every source', async () => {
  await seedHistory();
  const { pending } = await prepareBoard(db);
  expect(pending).toBe(false);
  const full = await readFullBoard(reader, players);
  const reference = await readMerged(db, roster);
  expect(full.results).toEqual(reference.rows);
  // The page reads only these two fields; a prototype roster also carried its reception date.
  expect(full.matchRosters).toEqual(
    reference.rosters.map(({ match_guid, expected_players }) => ({ match_guid, expected_players })),
  );
  expect(full.reliability).toEqual(reference.reliability);
  expect(full.results.some((row) => row.verification === 'review')).toBe(true);
  expect(full.results.some((row) => row.verification === 'corrected')).toBe(true);
  expect(full.results.some((row) => row.match_guid === 'prototype-match')).toBe(true);
});

test('a board read page by page, then change by change, always equals the whole board', async () => {
  await seedHistory();
  const board = await catchUp();
  await expectSameBoard(board);

  // A new match, sent by both collectors.
  await receive('match-new', 'live-alice', team(500));
  await receive('match-new', 'live-bob', team(500));
  await buildMatches(db, roster, [], ['match-new']);
  // An exercise taken back, with its reaction; a reaction added; another removed.
  await db.batch([
    db.prepare("DELETE FROM exercise_reactions WHERE exercise_id = 'exercise-alice-0000001'"),
    db.prepare("DELETE FROM exercises WHERE id = 'exercise-alice-0000001'"),
    db.prepare("INSERT INTO exercise_reactions VALUES ('exercise-alice-0000002', 'member-bob', '😂', 'x', 0)"),
    db.prepare("DELETE FROM exercise_reactions WHERE author = 'member-carla'"),
  ]);
  await expectSameBoard(await catchUp(board));

  // The member confirms the namesake's game ID: the match is rebuilt with the player's name.
  await db
    .prepare('INSERT INTO player_identity_aliases VALUES (?, ?, ?, ?)')
    .bind('PS4|carla-second|0', carla, 'member-carla', 'synthetic')
    .run();
  const renamed = await catchUp(board);
  await expectSameBoard(renamed);
  expect(boardView(renamed, roster).results.some((row) => row.name === carla)).toBe(true);
  expect(await readMerged(db, roster)).toMatchObject({ rows: (await readFullBoard(reader, players)).results });
});

test('an unchanged board reads one row and receives nothing', async () => {
  await seedHistory();
  const board = await catchUp();
  const head = await readHead(db);
  expect(head).toEqual({ version: board.version, pending: false });
  const again = await catchUp(structuredClone(board));
  expect(again.version).toBe(board.version);
});

test('a build that read sources a newer one overtook never lands', async () => {
  await receive('match-race', 'live-alice', team());
  // A first build reads the sources; another collector's view arrives before it writes.
  const reading = db.batch.bind(db);
  let overtaken = false;
  const racing = {
    prepare: db.prepare.bind(db),
    batch: async (statements: D1PreparedStatement[]) => {
      if (!overtaken && statements.length > 2) {
        const results = await reading(statements);
        overtaken = true;
        await receive('match-race', 'live-bob', team(400));
        return results;
      }
      return reading(statements);
    },
  };
  expect(await buildMatches(racing, roster, [], ['match-race'])).toEqual([]);
  expect((await readHead(db)).pending).toBe(true);
  expect(await buildMatches(db, roster, [], ['match-race'])).toEqual(['match-race']);
  const stored = await db.prepare("SELECT COUNT(*) AS n FROM match_results WHERE match_guid = 'match-race'").first();
  expect(stored?.n).toBe(4);
});
