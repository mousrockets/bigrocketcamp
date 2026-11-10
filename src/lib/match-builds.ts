import { and, desc, eq, isNotNull, type SQLWrapper, sql } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { Roster } from './club';
import type { Database } from './db';
import { inJsonList, orm, rowid, sqlNamed, statementOf } from './orm';
import {
  type Alias,
  type CompleteRoster,
  compareResults,
  type Departure,
  type MergedResult,
  mergeSources,
  type Observation,
  type SourceReport,
  type StoredResult,
} from './reconcile';
import {
  matchBuilds,
  matchDepartures,
  matchResults,
  prototypeMatchRosters,
  prototypeResults,
  resultObservations,
  sourceReports,
  syncState,
} from './schema';

// The board shows each match as its sources reconcile it. Reconciling the whole history on every visit
// would not fit the free plan, so each match is rebuilt alone when it receives a source, and stored.

/** A stored match result, as the board receives it. */
export interface BuiltResult extends MergedResult {
  /** Set on every row of a match whose full scoreboard a source confirmed. */
  expected_players: number | null;
}

interface StoredRow {
  match_guid: string;
  player_id: string;
  name: string;
  day: string;
  kind: string;
  team: number;
  winner: number;
  score: number;
  goals: number;
  assists: number;
  saves: number;
  demos: number | null;
  crossbar_hits: number | null;
  received: string;
  review_required: number;
  verification: MergedResult['verification'];
  source_types: string;
  selected_source: string;
  source_difference: MergedResult['source_difference'];
  expected_players: number | null;
  forfeit: boolean | null;
  overtime: boolean | null;
  left_early: boolean;
  blue_goals: number | null;
  orange_goals: number | null;
}

/** The stored results' columns, under the names the board receives. */
export const storedColumns = {
  match_guid: matchResults.matchGuid,
  player_id: matchResults.playerId,
  name: matchResults.name,
  day: matchResults.day,
  kind: matchResults.kind,
  team: matchResults.team,
  winner: matchResults.winner,
  score: matchResults.score,
  goals: matchResults.goals,
  assists: matchResults.assists,
  saves: matchResults.saves,
  demos: matchResults.demos,
  crossbar_hits: matchResults.crossbarHits,
  received: matchResults.received,
  review_required: matchResults.reviewRequired,
  verification: matchResults.verification,
  source_types: matchResults.sourceTypes,
  selected_source: matchResults.selectedSource,
  source_difference: matchResults.sourceDifference,
  expected_players: matchResults.expectedPlayers,
  forfeit: matchResults.forfeit,
  overtime: matchResults.overtime,
  left_early: matchResults.leftEarly,
  blue_goals: matchResults.blueGoals,
  orange_goals: matchResults.orangeGoals,
} satisfies Record<keyof StoredRow, AnySQLiteColumn>;

const columns = Object.keys(storedColumns) as (keyof StoredRow)[];

export const builtResult = (row: StoredRow): BuiltResult => ({
  match_guid: row.match_guid,
  player_id: row.player_id,
  name: row.name,
  day: row.day,
  kind: row.kind,
  team: row.team,
  winner: row.winner,
  score: row.score,
  goals: row.goals,
  assists: row.assists,
  saves: row.saves,
  demos: row.demos,
  crossbar_hits: row.crossbar_hits,
  received: row.received,
  review_required: Boolean(row.review_required),
  verification: row.verification,
  source_types: row.source_types ? row.source_types.split(',') : [],
  selected_source: row.selected_source,
  source_difference: row.source_difference,
  expected_players: row.expected_players,
  forfeit: row.forfeit,
  overtime: row.overtime,
  left: Boolean(row.left_early),
  blue_goals: row.blue_goals,
  orange_goals: row.orange_goals,
});

const storedRow = (row: MergedResult, expected: number | null): StoredRow => ({
  match_guid: row.match_guid,
  player_id: row.player_id,
  name: row.name,
  day: row.day,
  kind: row.kind,
  team: row.team,
  winner: row.winner,
  score: row.score,
  goals: row.goals,
  assists: row.assists,
  saves: row.saves,
  demos: row.demos ?? null,
  crossbar_hits: row.crossbar_hits ?? null,
  received: row.received,
  review_required: row.review_required ? 1 : 0,
  verification: row.verification,
  source_types: row.source_types.join(','),
  selected_source: row.selected_source,
  source_difference: row.source_difference,
  expected_players: expected,
  forfeit: row.forfeit,
  overtime: row.overtime,
  left_early: row.left,
  blue_goals: row.blue_goals,
  orange_goals: row.orange_goals,
});

const sameRow = (a: StoredRow, b: StoredRow) => columns.every((column) => a[column] === b[column]);
const rowKey = (row: { match_guid: string; player_id: string }) => JSON.stringify([row.match_guid, row.player_id]);

/** At most this many matches per write: the rows travel as one JSON parameter; about 2 ms of CPU. */
const chunkSize = 40;

/** The matches whose stored results no longer reflect all their sources (the partial index match_builds_pending). */
export const notBuilt = sql`${matchBuilds.builtRevision} IS NOT ${matchBuilds.revision}`;

// A build only lands if no source reached the match since it was read; otherwise the match stays pending.
const unchangedSince = (guid: SQLWrapper, guard: string) =>
  sql`${guid} IN (SELECT json_extract(value, '$[0]') FROM json_each(${guard})
    JOIN ${matchBuilds} ON ${matchBuilds.matchGuid} = json_extract(value, '$[0]') AND ${matchBuilds.revision} = json_extract(value, '$[1]'))`;

/** Rebuilds these matches from their sources; returns those whose new results were stored. */
export async function buildMatches(
  db: Database,
  roster: Roster,
  aliases: readonly Alias[],
  guids: readonly string[],
): Promise<string[]> {
  const built: string[] = [];
  for (let index = 0; index < guids.length; index += chunkSize) {
    built.push(...(await buildChunk(db, roster, aliases, guids.slice(index, index + chunkSize))));
  }
  return built;
}

/** Everything a build of these matches reads, in one batch: one transaction, so the revisions read are those of the sources read. */
function readSources(db: Database, guids: readonly string[]) {
  const query = orm(db);
  return query.batch([
    query
      .select({ match_guid: matchBuilds.matchGuid, revision: matchBuilds.revision })
      .from(matchBuilds)
      .where(inJsonList(matchBuilds.matchGuid, guids)),
    query
      .select(sqlNamed(resultObservations))
      .from(resultObservations)
      .where(inJsonList(resultObservations.matchGuid, guids))
      .orderBy(resultObservations.received, rowid),
    query
      .select(sqlNamed(sourceReports))
      .from(sourceReports)
      .where(inJsonList(sourceReports.matchGuid, guids))
      .orderBy(sourceReports.received, rowid),
    query
      .select(sqlNamed(matchDepartures))
      .from(matchDepartures)
      .where(inJsonList(matchDepartures.matchGuid, guids))
      .orderBy(matchDepartures.received, rowid),
    query
      .select(sqlNamed(prototypeResults))
      .from(prototypeResults)
      .where(inJsonList(sql`lower(trim(${prototypeResults.matchGuid}))`, guids))
      .orderBy(desc(prototypeResults.day), desc(prototypeResults.received), desc(rowid)),
    query
      .select(sqlNamed(prototypeMatchRosters))
      .from(prototypeMatchRosters)
      .where(inJsonList(sql`lower(trim(${prototypeMatchRosters.matchGuid}))`, guids)),
    query.select(storedColumns).from(matchResults).where(inJsonList(matchResults.matchGuid, guids)),
  ]);
}

async function buildChunk(db: Database, roster: Roster, aliases: readonly Alias[], guids: readonly string[]) {
  const [builds, observations, reports, departures, legacy, legacyRosters, stored] = await readSources(db, guids);
  const existing = stored as StoredRow[];
  const merged = mergeSources(roster, aliases, {
    legacy: legacy as StoredResult[],
    observations: observations as (Observation & { payload: string })[],
    rosters: legacyRosters as CompleteRoster[],
    reports: reports as (SourceReport & { players: string })[],
    departures: departures as (Departure & { payload: string })[],
  });
  const expected = new Map(merged.rosters.map((complete) => [complete.match_guid, complete.expected_players]));
  const wanted = new Set(guids);
  const next = merged.rows
    .filter((row) => wanted.has(row.match_guid))
    .map((row) => storedRow(row, expected.get(row.match_guid) ?? null));
  const before = new Map(existing.map((row) => [rowKey(row), row]));
  const nextKeys = new Set(next.map(rowKey));
  const changed = next.filter((row) => {
    const previous = before.get(rowKey(row));
    return !previous || !sameRow(previous, row);
  });
  const removed = existing.filter((row) => !nextKeys.has(rowKey(row))).map((row) => [row.match_guid, row.player_id]);
  const guard = JSON.stringify(builds.map((build) => [build.match_guid, build.revision]));
  const query = orm(db);
  const writes: SQLWrapper[] = [];
  if (removed.length) {
    writes.push(
      query
        .delete(matchResults)
        .where(
          and(
            unchangedSince(matchResults.matchGuid, guard),
            sql`(${matchResults.matchGuid}, ${matchResults.playerId}) IN (SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(${JSON.stringify(removed)}))`,
          ),
        ),
    );
  }
  if (changed.length) {
    // Raw: the rows come from json_each, which Drizzle's insert cannot select from without listing every column.
    writes.push(
      sql`INSERT INTO ${matchResults} (${sql.raw(columns.join(', '))})
        SELECT ${sql.raw(columns.map((column) => `json_extract(value, '$.${column}')`).join(', '))} FROM json_each(${JSON.stringify(changed)})
        WHERE ${unchangedSince(sql`json_extract(value, '$.match_guid')`, guard)}
        ON CONFLICT (match_guid, player_id) DO UPDATE SET ${sql.raw(
          columns
            .slice(2)
            .map((column) => `${column} = excluded.${column}`)
            .join(', '),
        )}`,
    );
  }
  writes.push(
    query
      .update(matchBuilds)
      .set({ builtRevision: sql`${matchBuilds.revision}` })
      .where(unchangedSince(matchBuilds.matchGuid, guard))
      .returning({ match_guid: matchBuilds.matchGuid }),
  );
  const results = await db.batch(writes.map((write) => statementOf(db, write)));
  return ((results.at(-1)?.results ?? []) as { match_guid: string }[]).map((row) => row.match_guid);
}

/** The matches waiting for a build, oldest first, at most `limit`. */
export async function pendingMatches(db: Database, limit: number): Promise<string[]> {
  const pending = await orm(db)
    .select({ match_guid: matchBuilds.matchGuid })
    .from(matchBuilds)
    .where(notBuilt)
    .limit(limit);
  return pending.map((row) => row.match_guid);
}

async function basisOf(roster: Roster, aliases: readonly Alias[], code: string): Promise<string> {
  const relevant = aliases
    .filter((alias) => roster.includes(alias.slot))
    .map((alias) => [alias.player_id, alias.slot])
    .sort((a, b) => String(a).localeCompare(String(b)));
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify([code, roster, relevant])),
  );
  return [...new Uint8Array(digest).slice(0, 12)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Builds the pending matches, a bounded number per request so that a large rebuild never exceeds the
 * free plan's CPU limit. A new roster or a newly confirmed game ID can rename players in any match, and new code
 * can build any match differently (`code`, scripts/match-build-code.ts): every match is then rebuilt. Returns
 * whether matches are still pending.
 */
export async function buildPendingMatches(
  db: Database,
  roster: Roster,
  aliases: readonly Alias[],
  { rounds = 2, code = __MATCH_BUILD_CODE__ }: { rounds?: number; code?: string } = {},
): Promise<boolean> {
  const basis = await basisOf(roster, aliases, code);
  const query = orm(db);
  const stored = await query
    .select({ matchBasis: syncState.matchBasis })
    .from(syncState)
    .where(eq(syncState.id, 1))
    .get();
  if (stored?.matchBasis !== basis) {
    await query.batch([
      query.update(matchBuilds).set({ builtRevision: null }).where(isNotNull(matchBuilds.builtRevision)),
      query.update(syncState).set({ matchBasis: basis }).where(eq(syncState.id, 1)),
    ]);
  }
  for (let round = 0; round < rounds; round++) {
    const pending = await pendingMatches(db, chunkSize);
    if (!pending.length) return false;
    await buildMatches(db, roster, aliases, pending);
  }
  return (await pendingMatches(db, 1)).length > 0;
}

/**
 * The stored match results, newest first; with a game ID, only the rows that may be that player's
 * (the comparison ignores case, as canonical game IDs do).
 */
export async function readStoredResults(db: Database, playerId?: string): Promise<BuiltResult[]> {
  const rows = await orm(db)
    .select(storedColumns)
    .from(matchResults)
    .where(playerId === undefined ? undefined : sql`lower(${matchResults.playerId}) = lower(${playerId})`);
  return (rows as StoredRow[]).map(builtResult).sort(compareResults);
}
