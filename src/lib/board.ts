import { type ClubPlayer, readClubPlayers, rosterOf } from './club';
import type { Database } from './db';
import { readDoublesRanks } from './doubles-ranks';
import { type BuiltResult, buildPendingMatches, builtResult } from './match-builds';
import { readMonthlyMmr } from './monthly-mmr';
import { readRankSourceHealth } from './rank-source';
import { type Alias, compareResults, reliabilityOf } from './reconcile';

// What the board shows. A board that opens reads everything once, page by page; an open board then
// receives only what changed since its last version, so its cost follows the activity, not the history.

export interface BoardExercise {
  id: string;
  player: string;
  count: number;
  day: string;
  created: string;
  type: string;
  /** Authors stay private: a member only learns which exercises are theirs. */
  mine: boolean;
}

export interface BoardReaction {
  exercise_id: string;
  emoji: string;
  count: number;
  /** 1 when the member reacted with this emoji. */
  mine: number;
}

export interface BoardHead {
  version: number;
  /** Matches received but not rebuilt yet. */
  pending: boolean;
}

export interface BoardReader {
  db: Database;
  memberId: string;
  /** Only an instance with a rank source can see it stop. */
  hasRankSource: boolean;
}

/** One row read: whether anything the board shows changed, and whether matches wait for a build. */
export async function readHead(db: Database): Promise<BoardHead> {
  const head = await db
    .prepare(
      'SELECT version, EXISTS (SELECT 1 FROM match_builds WHERE built_revision IS NOT revision) AS pending FROM sync_state WHERE id = 1',
    )
    .first<{ version: number; pending: number }>();
  return { version: head?.version ?? 0, pending: Boolean(head?.pending) };
}

/** Brings the stored match results up to date; returns the club's players and whether matches still wait. */
export async function prepareBoard(db: Database): Promise<{ players: ClubPlayer[]; pending: boolean }> {
  const [players, aliases] = await Promise.all([
    readClubPlayers(db),
    db.prepare('SELECT player_id, slot FROM player_identity_aliases').all<Alias>(),
  ]);
  const pending = await buildPendingMatches(db, rosterOf(players), aliases.results);
  return { players, pending };
}

const exerciseColumns = 'id, player, count, day, created, type, author = ?1 AS mine';
const asExercise = ({ mine, ...exercise }: Omit<BoardExercise, 'mine'> & { mine: number; seq?: number }) => {
  const { seq: _seq, ...rest } = exercise;
  return { ...rest, mine: Boolean(mine) };
};
const resultColumns =
  'match_guid, player_id, name, day, kind, team, winner, score, goals, assists, saves, received, review_required, verification, source_types, selected_source, source_difference, expected_players';
type ResultRow = Parameters<typeof builtResult>[0];

/** The parts of the board small enough to be sent whole with every change. */
async function readSmallParts({ db, memberId, hasRankSource }: BoardReader, players: ClubPlayer[]) {
  const [collectors, doublesRanks, monthly, rankSource] = await Promise.all([
    db.prepare('SELECT id, last_seen FROM collectors ORDER BY last_seen DESC').all(),
    readDoublesRanks(db, rosterOf(players)),
    readMonthlyMmr(db, players, memberId),
    hasRankSource ? readRankSourceHealth(db) : null,
  ]);
  return { collectors: collectors.results, doublesRanks, monthly, rankSource };
}

/** Matches whose full scoreboard is confirmed, in the order of their newest result. */
function confirmedRosters(rows: readonly BuiltResult[]) {
  const rosters = new Map<string, number>();
  for (const row of rows) {
    if (row.expected_players !== null && !rosters.has(row.match_guid)) {
      rosters.set(row.match_guid, row.expected_players);
    }
  }
  return [...rosters].map(([match_guid, expected_players]) => ({ match_guid, expected_players }));
}

/** The whole board in one answer, as boards built before page-by-page reading expect it. */
export async function readFullBoard(reader: BoardReader, players: ClubPlayer[]) {
  const { db, memberId } = reader;
  const roster = rosterOf(players);
  const [stored, exercises, reactions, me, small] = await Promise.all([
    db.prepare(`SELECT ${resultColumns} FROM match_results`).all<ResultRow>(),
    db.prepare(`SELECT ${exerciseColumns} FROM exercises ORDER BY created DESC`).bind(memberId).all(),
    db
      .prepare(
        'SELECT exercise_id, emoji, COUNT(*) AS count, MAX(author = ?) AS mine FROM exercise_reactions GROUP BY exercise_id, emoji',
      )
      .bind(memberId)
      .all<BoardReaction>(),
    db
      .prepare(
        'SELECT player FROM exercises WHERE author = ? GROUP BY player ORDER BY COUNT(*) DESC, MAX(created) DESC LIMIT 1',
      )
      .bind(memberId)
      .first<{ player: string }>(),
    readSmallParts(reader, players),
  ]);
  const rows = stored.results.map(builtResult).sort(compareResults);
  return {
    results: rows.map(({ expected_players: _expected, ...row }) => row),
    exercises: (exercises.results as Parameters<typeof asExercise>[0][]).map(asExercise),
    matchRosters: confirmedRosters(rows),
    reliability: reliabilityOf(roster, rows),
    reactions: reactions.results,
    me: me?.player ?? null,
    ...small,
  };
}

export type FullBoard = Awaited<ReturnType<typeof readFullBoard>>;

/** At most this many rows of each kind per answer: a board that opens reads its history in several pages. */
export const pageSize = 2000;

export interface BoardChanges extends Awaited<ReturnType<typeof readSmallParts>> {
  /** Ask again from this version. */
  version: number;
  /** More pages follow: ask again at once. */
  more: boolean;
  /** Forget everything held so far: this answer starts the board over. */
  reset: boolean;
  results: BuiltResult[];
  exercises: BoardExercise[];
  /** The reactions of the exercises listed in `reactionsOf`, which replace those held. */
  reactions: BoardReaction[];
  /** Exercises whose reactions are replaced, or every one of them. */
  reactionsOf: string[] | 'all';
  removed: { results: [string, string][]; exercises: string[] };
  /** Who the answer was made for: which exercises and reactions are "mine" depends on it. */
  viewer: string;
}

/** An opaque name of the member, to tell a board kept in the browser from another member's. */
async function viewerOf(memberId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`board:${memberId}`));
  return [...new Uint8Array(digest).slice(0, 9)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** What changed after version `since`; from 0, the whole board, page by page. */
export async function readBoardChanges(
  reader: BoardReader,
  players: ClubPlayer[],
  since: number,
  { limit = pageSize, pending = false }: { limit?: number; pending?: boolean } = {},
): Promise<BoardChanges> {
  const { db, memberId } = reader;
  const head = await db.prepare('SELECT version FROM sync_state WHERE id = 1').first<{ version: number }>();
  // A version from the future belongs to another database (a restored one): start over.
  const reset = since === 0 || since > (head?.version ?? 0);
  const from = reset ? 0 : since;
  const changedReactions =
    'SELECT exercise_id FROM exercise_reactions WHERE seq > ?1 UNION ALL SELECT key FROM sync_removals WHERE seq > ?1 AND collection = ?3';
  // One batch is one transaction: the version read is the one the rows read reflect.
  const [state, results, exercises, removals, reactions, reactionsOf] = (await db.batch([
    db.prepare('SELECT version FROM sync_state WHERE id = 1'),
    db
      .prepare(`SELECT ${resultColumns}, seq FROM match_results WHERE seq > ?1 ORDER BY seq LIMIT ?2`)
      .bind(from, limit),
    db
      .prepare(`SELECT ${exerciseColumns}, seq FROM exercises WHERE seq > ?2 ORDER BY seq LIMIT ?3`)
      .bind(memberId, from, limit),
    db
      .prepare('SELECT seq, collection, key, subkey FROM sync_removals WHERE seq > ?1 ORDER BY seq LIMIT ?2')
      .bind(from, limit),
    reset
      ? db
          .prepare(
            'SELECT exercise_id, emoji, COUNT(*) AS count, MAX(author = ?1) AS mine FROM exercise_reactions GROUP BY exercise_id, emoji',
          )
          .bind(memberId)
      : db
          .prepare(
            `SELECT exercise_id, emoji, COUNT(*) AS count, MAX(author = ?2) AS mine FROM exercise_reactions
              WHERE exercise_id IN (${changedReactions}) GROUP BY exercise_id, emoji`,
          )
          .bind(from, memberId, 'reactions'),
    reset
      ? db.prepare('SELECT NULL AS exercise_id WHERE 0')
      : db.prepare(changedReactions).bind(from, null, 'reactions'),
  ])) as [
    { results: { version: number }[] },
    { results: (ResultRow & { seq: number })[] },
    { results: (Parameters<typeof asExercise>[0] & { seq: number })[] },
    { results: { seq: number; collection: string; key: string; subkey: string | null }[] },
    { results: BoardReaction[] },
    { results: { exercise_id: string }[] },
  ];
  const version = state.results[0]?.version ?? 0;
  // A full page may hide rows of the same kind past it: the next answer resumes after its last row.
  let cursor = version;
  for (const page of [results.results, exercises.results, removals.results]) {
    const last = page.at(-1);
    if (page.length >= limit && last) cursor = Math.min(cursor, last.seq);
  }
  const small = await readSmallParts(reader, players);
  return {
    viewer: await viewerOf(memberId),
    version: cursor,
    more: cursor < version || pending,
    reset,
    results: results.results.map(({ seq: _seq, ...row }) => builtResult(row)),
    exercises: exercises.results.map(asExercise),
    reactions: reactions.results,
    reactionsOf: reset ? 'all' : [...new Set(reactionsOf.results.map((row) => row.exercise_id))],
    removed: {
      results: removals.results
        .filter((removal) => removal.collection === 'results')
        .map((removal) => [removal.key, removal.subkey ?? '']),
      exercises: removals.results.filter((removal) => removal.collection === 'exercises').map((removal) => removal.key),
    },
    ...small,
  };
}
