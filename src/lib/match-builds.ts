import type { Roster } from './club';
import type { Database, Statement } from './db';
import {
  type Alias,
  type CompleteRoster,
  type MergedResult,
  mergeSources,
  type Observation,
  type SourceReport,
  type StoredResult,
} from './reconcile';

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
  received: string;
  review_required: number;
  verification: MergedResult['verification'];
  source_types: string;
  selected_source: string;
  source_difference: MergedResult['source_difference'];
  expected_players: number | null;
}

const columns = [
  'match_guid',
  'player_id',
  'name',
  'day',
  'kind',
  'team',
  'winner',
  'score',
  'goals',
  'assists',
  'saves',
  'received',
  'review_required',
  'verification',
  'source_types',
  'selected_source',
  'source_difference',
  'expected_players',
] as const satisfies readonly (keyof StoredRow)[];

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
  received: row.received,
  review_required: Boolean(row.review_required),
  verification: row.verification,
  source_types: row.source_types ? row.source_types.split(',') : [],
  selected_source: row.selected_source,
  source_difference: row.source_difference,
  expected_players: row.expected_players,
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
  received: row.received,
  review_required: row.review_required ? 1 : 0,
  verification: row.verification,
  source_types: row.source_types.join(','),
  selected_source: row.selected_source,
  source_difference: row.source_difference,
  expected_players: expected,
});

const sameRow = (a: StoredRow, b: StoredRow) => columns.every((column) => a[column] === b[column]);
const rowKey = (row: { match_guid: string; player_id: string }) => JSON.stringify([row.match_guid, row.player_id]);

/** At most this many matches per write: the rows travel as one JSON parameter; about 2 ms of CPU. */
const chunkSize = 40;

/** The matches whose stored results no longer reflect all their sources. */
const pendingQuery = 'SELECT match_guid FROM match_builds WHERE built_revision IS NOT revision';
const inList = 'SELECT value FROM json_each(?1)';
// A build only lands if no source reached the match since it was read; otherwise the match stays pending.
const unchangedSince = `SELECT json_extract(value, '$[0]') FROM json_each(?1)
  JOIN match_builds ON match_builds.match_guid = json_extract(value, '$[0]') AND match_builds.revision = json_extract(value, '$[1]')`;

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

async function buildChunk(db: Database, roster: Roster, aliases: readonly Alias[], guids: readonly string[]) {
  const list = JSON.stringify(guids);
  // One batch is one transaction: the revisions read are those of the sources read.
  const [builds, observations, reports, legacy, legacyRosters, existing] = (await db.batch([
    db.prepare(`SELECT match_guid, revision FROM match_builds WHERE match_guid IN (${inList})`).bind(list),
    db.prepare(`SELECT * FROM result_observations WHERE match_guid IN (${inList}) ORDER BY received, rowid`).bind(list),
    db.prepare(`SELECT * FROM source_reports WHERE match_guid IN (${inList}) ORDER BY received, rowid`).bind(list),
    db
      .prepare(
        `SELECT * FROM results WHERE lower(trim(match_guid)) IN (${inList}) ORDER BY day DESC, received DESC, rowid DESC`,
      )
      .bind(list),
    db.prepare(`SELECT * FROM match_rosters WHERE lower(trim(match_guid)) IN (${inList})`).bind(list),
    db.prepare(`SELECT ${columns.join(', ')} FROM match_results WHERE match_guid IN (${inList})`).bind(list),
  ])) as [
    { results: { match_guid: string; revision: number }[] },
    { results: (Observation & { payload: string })[] },
    { results: (SourceReport & { players: string })[] },
    { results: StoredResult[] },
    { results: CompleteRoster[] },
    { results: StoredRow[] },
  ];
  const merged = mergeSources(roster, aliases, {
    legacy: legacy.results,
    observations: observations.results,
    rosters: legacyRosters.results,
    reports: reports.results,
  });
  const expected = new Map(merged.rosters.map((complete) => [complete.match_guid, complete.expected_players]));
  const wanted = new Set(guids);
  const next = merged.rows
    .filter((row) => wanted.has(row.match_guid))
    .map((row) => storedRow(row, expected.get(row.match_guid) ?? null));
  const before = new Map(existing.results.map((row) => [rowKey(row), row]));
  const nextKeys = new Set(next.map(rowKey));
  const changed = next.filter((row) => {
    const previous = before.get(rowKey(row));
    return !previous || !sameRow(previous, row);
  });
  const removed = existing.results
    .filter((row) => !nextKeys.has(rowKey(row)))
    .map((row) => [row.match_guid, row.player_id]);
  const guard = JSON.stringify(builds.results.map((build) => [build.match_guid, build.revision]));
  const writes: Statement[] = [];
  if (removed.length) {
    writes.push(
      db
        .prepare(
          `DELETE FROM match_results WHERE match_guid IN (${unchangedSince})
            AND (match_guid, player_id) IN (SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?2))`,
        )
        .bind(guard, JSON.stringify(removed)),
    );
  }
  if (changed.length) {
    writes.push(
      db
        .prepare(
          `INSERT INTO match_results (${columns.join(', ')})
            SELECT ${columns.map((column) => `json_extract(value, '$.${column}')`).join(', ')} FROM json_each(?2)
            WHERE json_extract(value, '$.match_guid') IN (${unchangedSince})
            ON CONFLICT (match_guid, player_id) DO UPDATE SET ${columns
              .slice(2)
              .map((column) => `${column} = excluded.${column}`)
              .join(', ')}`,
        )
        .bind(guard, JSON.stringify(changed)),
    );
  }
  writes.push(
    db
      .prepare(
        `UPDATE match_builds SET built_revision = revision WHERE match_guid IN (${unchangedSince}) RETURNING match_guid`,
      )
      .bind(guard),
  );
  const results = await db.batch(writes);
  return ((results.at(-1)?.results ?? []) as { match_guid: string }[]).map((row) => row.match_guid);
}

/** The matches waiting for a build, oldest first, at most `limit`. */
export async function pendingMatches(db: Database, limit: number): Promise<string[]> {
  const pending = await db.prepare(`${pendingQuery} LIMIT ?`).bind(limit).all<{ match_guid: string }>();
  return pending.results.map((row) => row.match_guid);
}

async function basisOf(roster: Roster, aliases: readonly Alias[]): Promise<string> {
  const relevant = aliases
    .filter((alias) => roster.includes(alias.slot))
    .map((alias) => [alias.player_id, alias.slot])
    .sort((a, b) => String(a).localeCompare(String(b)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([roster, relevant])));
  return [...new Uint8Array(digest).slice(0, 12)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Builds the pending matches, a bounded number per request so that a large rebuild never exceeds the
 * free plan's CPU limit. A new roster or a newly confirmed game ID can rename players in any match:
 * every match is then rebuilt. Returns whether matches are still pending.
 */
export async function buildPendingMatches(
  db: Database,
  roster: Roster,
  aliases: readonly Alias[],
  { rounds = 2 }: { rounds?: number } = {},
): Promise<boolean> {
  const basis = await basisOf(roster, aliases);
  const stored = await db
    .prepare('SELECT match_basis FROM sync_state WHERE id = 1')
    .first<{ match_basis: string | null }>();
  if (stored?.match_basis !== basis) {
    await db.batch([
      db.prepare('UPDATE match_builds SET built_revision = NULL WHERE built_revision IS NOT NULL'),
      db.prepare('UPDATE sync_state SET match_basis = ? WHERE id = 1').bind(basis),
    ]);
  }
  for (let round = 0; round < rounds; round++) {
    const pending = await pendingMatches(db, chunkSize);
    if (!pending.length) return false;
    await buildMatches(db, roster, aliases, pending);
  }
  return (await pendingMatches(db, 1)).length > 0;
}
