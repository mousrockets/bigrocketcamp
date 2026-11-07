import { and, count, desc, eq, exists, gt, inArray, max, sql } from 'drizzle-orm';
import { type ClubPlayer, readClubPlayers, rosterOf } from './club';
import { readChallengeRules } from './club-rules';
import type { Database } from './db';
import { readDoublesRanks } from './doubles-ranks';
import { type BuiltResult, buildPendingMatches, builtResult, notBuilt, storedColumns } from './match-builds';
import { readMonthlyMmr } from './monthly-mmr';
import { orm } from './orm';
import { readRankSourceHealth } from './rank-source';
import { type Alias, compareResults, reliabilityOf } from './reconcile';
import {
  collectors,
  exerciseReactions,
  exercises,
  matchBuilds,
  matchResults,
  playerIdentityAliases,
  syncRemovals,
  syncState,
} from './schema';

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
  const query = orm(db);
  const head = await query
    .select({
      version: syncState.version,
      pending: exists(query.select({ one: sql`1` }).from(matchBuilds).where(notBuilt)),
    })
    .from(syncState)
    .where(eq(syncState.id, 1))
    .get();
  return { version: head?.version ?? 0, pending: Boolean(head?.pending) };
}

/** Brings the stored match results up to date; returns the club's players and whether matches still wait. */
export async function prepareBoard(db: Database): Promise<{ players: ClubPlayer[]; pending: boolean }> {
  const [players, aliases] = await Promise.all([
    readClubPlayers(db),
    orm(db)
      .select({ player_id: playerIdentityAliases.playerId, slot: playerIdentityAliases.slot })
      .from(playerIdentityAliases),
  ]);
  const pending = await buildPendingMatches(db, rosterOf(players), aliases satisfies Alias[]);
  return { players, pending };
}

/** Authors stay private: the board only learns whether the member is the author. */
const exerciseColumns = (memberId: string) => ({
  id: exercises.id,
  player: exercises.player,
  count: exercises.count,
  day: exercises.day,
  created: exercises.created,
  type: exercises.type,
  mine: sql<number>`${exercises.author} = ${memberId}`.as('mine'),
});

const reactionColumns = (memberId: string) => ({
  exercise_id: exerciseReactions.exerciseId,
  emoji: exerciseReactions.emoji,
  count: count(),
  mine: sql<number>`max(${exerciseReactions.author} = ${memberId})`.as('mine'),
});

const asExercise = ({ mine, ...exercise }: Omit<BoardExercise, 'mine'> & { mine: number; seq?: number }) => {
  const { seq: _seq, ...rest } = exercise;
  return { ...rest, mine: Boolean(mine) };
};
type ResultRow = Parameters<typeof builtResult>[0];

/** The parts of the board small enough to be sent whole with every change. */
async function readSmallParts({ db, memberId, hasRankSource }: BoardReader, players: ClubPlayer[]) {
  const [sources, doublesRanks, monthly, rankSource, rules] = await Promise.all([
    orm(db)
      .select({ id: collectors.id, last_seen: collectors.lastSeen })
      .from(collectors)
      .orderBy(desc(collectors.lastSeen)),
    readDoublesRanks(db, rosterOf(players)),
    readMonthlyMmr(db, players, memberId),
    hasRankSource ? readRankSourceHealth(db) : null,
    readChallengeRules(db),
  ]);
  return { collectors: sources, doublesRanks, monthly, rankSource, rules };
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
  const query = orm(db);
  const [stored, exerciseRows, reactions, me, small] = await Promise.all([
    query.select(storedColumns).from(matchResults),
    query.select(exerciseColumns(memberId)).from(exercises).orderBy(desc(exercises.created)),
    query
      .select(reactionColumns(memberId))
      .from(exerciseReactions)
      .groupBy(exerciseReactions.exerciseId, exerciseReactions.emoji),
    query
      .select({ player: exercises.player })
      .from(exercises)
      .where(eq(exercises.author, memberId))
      .groupBy(exercises.player)
      .orderBy(desc(count()), desc(max(exercises.created)))
      .limit(1)
      .get(),
    readSmallParts(reader, players),
  ]);
  const rows = (stored as ResultRow[]).map(builtResult).sort(compareResults);
  return {
    results: rows.map(({ expected_players: _expected, ...row }) => row),
    exercises: exerciseRows.map(asExercise),
    matchRosters: confirmedRosters(rows),
    reliability: reliabilityOf(roster, rows),
    reactions: reactions satisfies BoardReaction[],
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
  const query = orm(db);
  const readVersion = () => query.select({ version: syncState.version }).from(syncState).where(eq(syncState.id, 1));
  const head = await readVersion().get();
  // A version from the future belongs to another database (a restored one): start over.
  const reset = since === 0 || since > (head?.version ?? 0);
  const from = reset ? 0 : since;
  const changedReactions = query
    .select({ exercise_id: exerciseReactions.exerciseId })
    .from(exerciseReactions)
    .where(gt(exerciseReactions.seq, from))
    .unionAll(
      query
        .select({ exercise_id: syncRemovals.key })
        .from(syncRemovals)
        .where(and(gt(syncRemovals.seq, from), eq(syncRemovals.collection, 'reactions'))),
    );
  // One batch is one transaction: the version read is the one the rows read reflect.
  const [state, results, exerciseRows, removals, reactions, reactionsOf] = await query.batch([
    readVersion(),
    query
      .select({ ...storedColumns, seq: matchResults.seq })
      .from(matchResults)
      .where(gt(matchResults.seq, from))
      .orderBy(matchResults.seq)
      .limit(limit),
    query
      .select({ ...exerciseColumns(memberId), seq: exercises.seq })
      .from(exercises)
      .where(gt(exercises.seq, from))
      .orderBy(exercises.seq)
      .limit(limit),
    query
      .select({
        seq: syncRemovals.seq,
        collection: syncRemovals.collection,
        key: syncRemovals.key,
        subkey: syncRemovals.subkey,
      })
      .from(syncRemovals)
      .where(gt(syncRemovals.seq, from))
      .orderBy(syncRemovals.seq)
      .limit(limit),
    query
      .select(reactionColumns(memberId))
      .from(exerciseReactions)
      .where(reset ? undefined : inArray(exerciseReactions.exerciseId, changedReactions))
      .groupBy(exerciseReactions.exerciseId, exerciseReactions.emoji),
    // A reset replaces every reaction: no list of changed ones to read.
    reset ? changedReactions.limit(0) : changedReactions,
  ]);
  const version = state[0]?.version ?? 0;
  // A full page may hide rows of the same kind past it: the next answer resumes after its last row.
  let cursor = version;
  for (const page of [results, exerciseRows, removals]) {
    const last = page.at(-1);
    if (page.length >= limit && last) cursor = Math.min(cursor, last.seq);
  }
  const small = await readSmallParts(reader, players);
  return {
    viewer: await viewerOf(memberId),
    version: cursor,
    more: cursor < version || pending,
    reset,
    results: results.map(({ seq: _seq, ...row }) => builtResult(row as ResultRow)),
    exercises: exerciseRows.map(asExercise),
    reactions,
    reactionsOf: reset ? 'all' : [...new Set(reactionsOf.map((row) => row.exercise_id))],
    removed: {
      results: removals
        .filter((removal) => removal.collection === 'results')
        .map((removal) => [removal.key, removal.subkey ?? '']),
      exercises: removals.filter((removal) => removal.collection === 'exercises').map((removal) => removal.key),
    },
    ...small,
  };
}
