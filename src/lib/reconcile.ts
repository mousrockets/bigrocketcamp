import { desc, sql } from 'drizzle-orm';
import type { Roster } from './club';
import type { Database, Statement } from './db';
import { endingOf, type MatchEnding, type ReceivedRoster, unknownEnding } from './match-rules';
import { excluded, orm, rowid, sqlNamed, statementOf } from './orm';
import {
  matchDepartures,
  playerIdentityAliases,
  prototypeMatchRosters,
  prototypeResults,
  resultObservations,
  sourceReports,
} from './schema';

/** A result as stored and as served to the web app. */
export interface StoredResult {
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
  /** Absent or null while no source sent them (older collectors, Epic's history). */
  demos?: number | null;
  crossbar_hits?: number | null;
  received?: string;
}

/** The goals of each team as the game counted them, those of players who left included; null when no source sent them. */
export interface FinalScore {
  blue_goals: number | null;
  orange_goals: number | null;
}

/** How a match ended, and its score, while no source told them. */
const unknownFinish: MatchEnding & FinalScore = { ...unknownEnding, blue_goals: null, orange_goals: null };

export interface MergedResult extends StoredResult, MatchEnding, FinalScore {
  received: string;
  demos: number | null;
  crossbar_hits: number | null;
  /** The player left before the end: a defeat, kept apart from the final scoreboard. */
  left: boolean;
  review_required: boolean;
  verification: 'review' | 'corrected' | 'confirmed' | 'single';
  source_types: string[];
  selected_source: string;
  source_difference: 'result' | 'stats' | 'identity' | null;
}

export interface Observation {
  match_guid: string;
  player_id?: string;
  source_id: string;
  source_type: string;
  payload: string | StoredResult;
  received: string;
}

export interface SourceReport {
  match_guid: string;
  source_id?: string;
  source_type: string;
  expected_players: number;
  players: string | StoredResult[];
  received: string;
  /** The clock the source read at the end of the match; null or absent when it sent none. */
  time_seconds?: number | null;
  overtime?: boolean | null;
  /** Every opponent left before the end, as the source's departures showed; null or absent otherwise. */
  opponents_gone?: boolean | null;
  /** The goals of each team, as the game counted them; null or absent when the source sent none. */
  blue_goals?: number | null;
  orange_goals?: number | null;
}

/** A player who left a match before its end, as one source saw it: his last line, a defeat. */
export interface Departure {
  match_guid: string;
  player_id?: string;
  source_id: string;
  source_type: string;
  payload: string | StoredResult;
  received: string;
}

export interface CompleteRoster {
  match_guid: string;
  expected_players: number;
  received?: string;
}

interface Candidate {
  row: StoredResult;
  type: string;
  source: string;
  received: string;
}

/**
 * Demolitions and crossbar hits, which older collectors and Epic never send: unknown, not zero. The chosen line
 * may come from such a source while another source of the same line counted them, so its own count comes first,
 * then the latest source that has one.
 */
function extraStatisticsOf(chosen: Candidate, candidates: readonly Candidate[]) {
  const others = candidates.filter((candidate) => candidate !== chosen);
  const ordered = [chosen, ...others.sort((a, b) => b.received.localeCompare(a.received))];
  const known = (field: 'demos' | 'crossbar_hits') =>
    ordered.map((candidate) => candidate.row[field]).find((value) => typeof value === 'number') ?? null;
  return { demos: known('demos'), crossbar_hits: known('crossbar_hits') };
}

const outcomeFields = ['day', 'kind', 'team', 'winner'] as const;
const scoreFields = ['score', 'goals', 'assists', 'saves'] as const;

export const playerKey = (id: unknown): string =>
  String(id)
    .replace(/^PSN\|/i, 'PS4|')
    .replace(/^epic\|/i, 'Epic|')
    .replace(/^steam\|/i, 'Steam|');
export const matchKey = (id: unknown): string => String(id).trim().toLowerCase();

const rowKey = (row: StoredResult) => JSON.stringify([matchKey(row.match_guid), playerKey(row.player_id)]);
const same = (a: StoredResult, b: StoredResult, fields: readonly (keyof StoredResult)[]) =>
  fields.every((field) => a[field] === b[field]);
const rank = (candidate: Candidate) => (candidate.type === 'epic' ? 2 : 1);

function choose(a: Candidate, b: Candidate): Candidate {
  if (rank(a) !== rank(b)) return rank(a) > rank(b) ? a : b;
  if (a.type === 'epic') return a.received >= b.received ? a : b;
  if (a.row.kind !== b.row.kind) return a.row.kind === 'match' ? a : b;
  if (a.row.score !== b.row.score) return a.row.score > b.row.score ? a : b;
  return a.received >= b.received ? a : b;
}

export function reconcile(
  roster: Roster,
  legacy: StoredResult[],
  observations: Observation[] = [],
  legacyRosters: CompleteRoster[] = [],
  reports: SourceReport[] = [],
  departures: Departure[] = [],
) {
  const groups = new Map<string, Candidate[]>();
  const add = (candidate: Candidate) => {
    if (!candidate.row || typeof candidate.row.match_guid !== 'string' || typeof candidate.row.player_id !== 'string')
      return;
    const key = rowKey(candidate.row);
    const group = groups.get(key);
    if (group) group.push(candidate);
    else groups.set(key, [candidate]);
  };
  for (const row of legacy) add({ row, type: 'collector', source: 'legacy', received: row.received || '' });
  for (const item of observations) {
    try {
      add({
        row: typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload,
        type: item.source_type,
        source: item.source_id,
        received: item.received,
      });
    } catch {
      // An unreadable observation is skipped; the others still count.
    }
  }
  let rows: MergedResult[] = [];
  for (const candidates of groups.values()) {
    const perSource = new Map<string, Candidate>();
    for (const candidate of candidates) {
      const key = `${candidate.type}:${candidate.source}`;
      const previous = perSource.get(key);
      perSource.set(key, previous ? choose(previous, candidate) : candidate);
    }
    const sources = [...perSource.values()];
    const chosen = sources.reduce(choose);
    const epic = chosen.type === 'epic';
    const outcomeConflict = candidates.some(
      (candidate) =>
        candidate.row.kind === 'match' &&
        chosen.row.kind === 'match' &&
        !same(candidate.row, chosen.row, outcomeFields),
    );
    const scoreConflict = sources.some((candidate) => !same(candidate.row, chosen.row, scoreFields));
    // A whole source snapshot wins. Never combine unrelated MAX(score/goals/...).
    const types = [...new Set(sources.map((candidate) => candidate.type))];
    const review = outcomeConflict && !epic;
    rows.push({
      ...chosen.row,
      match_guid: matchKey(chosen.row.match_guid),
      received: chosen.received,
      player_id: playerKey(chosen.row.player_id),
      ...extraStatisticsOf(chosen, candidates),
      review_required: review,
      verification: review
        ? 'review'
        : outcomeConflict || scoreConflict
          ? 'corrected'
          : types.length > 1
            ? 'confirmed'
            : 'single',
      source_types: types,
      selected_source: chosen.type,
      source_difference: outcomeConflict ? 'result' : scoreConflict ? 'stats' : null,
      left: false,
      ...unknownFinish,
    });
  }
  // Different platform IDs with the same group nickname cannot silently count twice.
  const tracked = new Map<string, MergedResult[]>();
  const keep: MergedResult[] = [];
  for (const row of rows) {
    if (!roster.includes(row.name)) {
      keep.push(row);
      continue;
    }
    const key = JSON.stringify([row.match_guid, row.name]);
    const group = tracked.get(key);
    if (group) group.push(row);
    else tracked.set(key, [row]);
  }
  for (const duplicates of tracked.values()) {
    const [first] = duplicates;
    if (!first) continue;
    if (duplicates.length === 1) keep.push(first);
    else keep.push({ ...first, review_required: true, verification: 'review', source_difference: 'identity' });
  }
  const endings = matchEndings(reports);
  rows = keep.map((row) => ({ ...row, ...endings.get(row.match_guid) })).sort(compareResults);
  const byMatch = new Map<string, MergedResult[]>();
  for (const row of rows) {
    const group = byMatch.get(row.match_guid);
    if (group) group.push(row);
    else byMatch.set(row.match_guid, [row]);
  }
  const complete: CompleteRoster[] = [];
  for (const [guid, players] of byMatch) {
    if (players.some((player) => player.review_required)) continue;
    const candidates: SourceReport[] = [];
    for (const report of reports.filter((candidate) => matchKey(candidate.match_guid) === guid)) {
      try {
        const snapshot: StoredResult[] =
          typeof report.players === 'string' ? JSON.parse(report.players) : report.players;
        if (
          !Array.isArray(snapshot) ||
          snapshot.length !== report.expected_players ||
          players.length !== snapshot.length
        )
          continue;
        const matchesSnapshot = snapshot.every((reported) =>
          players.some(
            (player) =>
              playerKey(player.player_id) === playerKey(reported.player_id) &&
              same(player, reported, [...outcomeFields, ...scoreFields]),
          ),
        );
        if (!matchesSnapshot) continue;
        candidates.push(report);
      } catch {
        // An unreadable report never completes a match.
      }
    }
    candidates.sort(
      (a, b) =>
        (b.source_type === 'epic' ? 2 : 1) - (a.source_type === 'epic' ? 2 : 1) || b.received.localeCompare(a.received),
    );
    const [best] = candidates;
    if (best) complete.push({ match_guid: guid, expected_players: best.expected_players });
    else if (
      !observations.some((observation) => matchKey(observation.match_guid) === guid) &&
      !reports.some((report) => matchKey(report.match_guid) === guid)
    ) {
      const old = legacyRosters.find((roster) => matchKey(roster.match_guid) === guid);
      if (old && old.expected_players === players.length) complete.push({ ...old, match_guid: guid });
    }
  }
  rows = [...rows, ...departedRows(roster, rows, departures, endings)].sort(compareResults);
  return { rows, rosters: complete, reliability: reliabilityOf(roster, rows) };
}

/**
 * The club players who left a match before its end, one row each: a defeat. A departure counts only while no
 * source sent a final line of that player in that match (he came back, or the leave was a misread), and the same
 * departure from several sources counts once.
 */
function departedRows(
  roster: Roster,
  finals: readonly MergedResult[],
  departures: readonly Departure[],
  endings: Map<string, MatchEnding & FinalScore>,
): MergedResult[] {
  const finalKeys = new Set(finals.map(rowKey));
  const finalNames = new Set(finals.map((row) => JSON.stringify([row.match_guid, row.name])));
  const groups = new Map<string, Candidate[]>();
  for (const departure of departures) {
    let row: StoredResult;
    try {
      row = typeof departure.payload === 'string' ? JSON.parse(departure.payload) : departure.payload;
    } catch {
      continue;
    }
    if (!row || typeof row.match_guid !== 'string' || typeof row.player_id !== 'string') continue;
    if (!roster.includes(row.name) || row.kind !== 'match') continue;
    const guid = matchKey(row.match_guid);
    if (finalKeys.has(rowKey(row)) || finalNames.has(JSON.stringify([guid, row.name]))) continue;
    const key = rowKey(row);
    const candidate = { row, type: departure.source_type, source: departure.source_id, received: departure.received };
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  return [...groups.values()].map((candidates) => {
    const chosen = candidates.reduce((a, b) => (b.received > a.received ? b : a));
    const types = [...new Set(candidates.map((candidate) => candidate.type))];
    const sources = new Set(candidates.map((candidate) => `${candidate.type}:${candidate.source}`));
    const guid = matchKey(chosen.row.match_guid);
    return {
      ...chosen.row,
      match_guid: guid,
      player_id: playerKey(chosen.row.player_id),
      ...extraStatisticsOf(chosen, candidates),
      received: chosen.received,
      review_required: false,
      verification: sources.size > 1 ? 'confirmed' : 'single',
      source_types: types,
      selected_source: chosen.type,
      source_difference: null,
      left: true,
      ...(endings.get(guid) ?? unknownFinish),
    };
  });
}

/** The one value the sources that know agree on; null when none knows, or when they disagree. */
function agreed<Value>(values: readonly (Value | null)[]): Value | null {
  const known = new Set(values.filter((value) => value !== null));
  return known.size === 1 ? ([...known][0] ?? null) : null;
}

/**
 * How each match ended, from the clocks its sources read: several collectors may have sent the same match. A
 * source that saw every opponent leave before the end saw a forfeit, whatever the clocks say.
 */
function matchEndings(reports: readonly SourceReport[]): Map<string, MatchEnding & FinalScore> {
  const byMatch = new Map<string, { endings: MatchEnding[]; scores: (string | null)[]; gone: boolean }>();
  for (const report of reports) {
    const guid = matchKey(report.match_guid);
    const ending = endingOf({ timeSeconds: report.time_seconds, overtime: report.overtime });
    const seen = byMatch.get(guid) ?? { endings: [], scores: [], gone: false };
    byMatch.set(guid, {
      endings: [...seen.endings, ending],
      scores: [...seen.scores, scoreKey(report)],
      gone: seen.gone || Boolean(report.opponents_gone),
    });
  }
  return new Map(
    [...byMatch].map(([guid, { endings, scores, gone }]) => [
      guid,
      {
        forfeit: gone ? true : agreed(endings.map((ending) => ending.forfeit)),
        overtime: agreed(endings.map((ending) => ending.overtime)),
        ...scoreOf(agreed(scores)),
      },
    ]),
  );
}

// Sources agree on a score as a whole: both goals compared at once, as one key.
const scoreKey = (report: SourceReport): string | null =>
  typeof report.blue_goals === 'number' && typeof report.orange_goals === 'number'
    ? JSON.stringify([report.blue_goals, report.orange_goals])
    : null;

function scoreOf(key: string | null): FinalScore {
  if (!key) return { blue_goals: null, orange_goals: null };
  const [blue_goals, orange_goals] = JSON.parse(key) as [number, number];
  return { blue_goals, orange_goals };
}

/** Newest day first, then newest reception: the order the board lists results in. */
export function compareResults(a: MergedResult, b: MergedResult): number {
  return (
    b.day.localeCompare(a.day) ||
    (b.received || '').localeCompare(a.received || '') ||
    a.match_guid.localeCompare(b.match_guid) ||
    a.player_id.localeCompare(b.player_id)
  );
}

export interface Reliability {
  confirmed: number;
  single: number;
  corrected: number;
  review: number;
}

/** How the club's own match results were checked. */
export function reliabilityOf(
  roster: Roster,
  rows: readonly Pick<MergedResult, 'name' | 'kind' | 'verification' | 'review_required'>[],
): Reliability {
  const groupRows = rows.filter((row) => roster.includes(row.name) && row.kind === 'match');
  return {
    confirmed: groupRows.filter((row) => row.verification === 'confirmed').length,
    single: groupRows.filter((row) => row.verification === 'single').length,
    corrected: groupRows.filter((row) => row.verification === 'corrected').length,
    review: groupRows.filter((row) => row.review_required).length,
  };
}

interface ReceivedRow {
  matchGuid: string;
  playerId: string;
  name: string;
  day: string;
  kind: string;
  team: number;
  winner: number;
  score: number;
  goals: number;
  assists: number;
  saves: number;
  demos?: number;
  crossbarHits?: number;
}

const asStored = (row: ReceivedRow, now: string): StoredResult => ({
  match_guid: matchKey(row.matchGuid),
  player_id: playerKey(row.playerId),
  name: row.name,
  day: row.day,
  kind: row.kind,
  team: row.team,
  winner: row.winner,
  score: row.score,
  goals: row.goals,
  assists: row.assists,
  saves: row.saves,
  ...(row.demos === undefined ? {} : { demos: row.demos }),
  ...(row.crossbarHits === undefined ? {} : { crossbar_hits: row.crossbarHits }),
  received: now,
});

async function sha(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function observationWrites(
  db: Database,
  {
    rows,
    rosters = [],
    departures = [],
    sourceId,
    sourceType,
  }: {
    rows: ReceivedRow[];
    rosters?: ReceivedRoster[];
    /** Players who left before the end; stored apart from the final scoreboard. */
    departures?: ReceivedRow[];
    sourceId: string;
    sourceType: string;
  },
  now: string,
): Promise<Statement[]> {
  if (!['collector', 'epic'].includes(sourceType)) throw new Error('Source invalide.');
  const stored = rows.map((row) => asStored(row, now));
  const query = orm(db);
  // D1 statements, not Drizzle queries: callers batch them with their own writes.
  const writes: Statement[] = [];
  for (const row of stored) {
    const payload = JSON.stringify({ ...row, received: undefined });
    const id = await sha(JSON.stringify([sourceType, sourceId, payload]));
    const observation = query
      .insert(resultObservations)
      .values({ id, matchGuid: row.match_guid, playerId: row.player_id, sourceId, sourceType, payload, received: now })
      .onConflictDoUpdate({
        target: resultObservations.id,
        set: { received: sql`max(${resultObservations.received}, ${excluded(resultObservations.received)})` },
      });
    writes.push(statementOf(db, observation));
  }
  for (const roster of rosters) {
    const players = stored
      .filter((row) => row.match_guid === matchKey(roster.matchGuid))
      .map((row) => ({ ...row, received: undefined }))
      .sort((a, b) => a.player_id.localeCompare(b.player_id));
    const payload = JSON.stringify(players);
    const id = await sha(JSON.stringify([sourceType, sourceId, roster.matchGuid, payload]));
    const report = query
      .insert(sourceReports)
      .values({
        id,
        matchGuid: matchKey(roster.matchGuid),
        sourceId,
        sourceType,
        expectedPlayers: roster.playerCount,
        players: payload,
        received: now,
        timeSeconds: roster.timeSeconds ?? null,
        overtime: roster.overtime ?? null,
        clockTrace: roster.clockTrace ?? null,
        opponentsGone: roster.opponentsGone ?? null,
        blueGoals: roster.blueGoals ?? null,
        orangeGoals: roster.orangeGoals ?? null,
      })
      .onConflictDoUpdate({
        target: sourceReports.id,
        set: {
          received: sql`max(${sourceReports.received}, ${excluded(sourceReports.received)})`,
          // The same scoreboard sent again by a newer collector brings the clock an older one left out.
          timeSeconds: sql`coalesce(${excluded(sourceReports.timeSeconds)}, ${sourceReports.timeSeconds})`,
          overtime: sql`coalesce(${excluded(sourceReports.overtime)}, ${sourceReports.overtime})`,
          clockTrace: sql`coalesce(${excluded(sourceReports.clockTrace)}, ${sourceReports.clockTrace})`,
          opponentsGone: sql`coalesce(${excluded(sourceReports.opponentsGone)}, ${sourceReports.opponentsGone})`,
          blueGoals: sql`coalesce(${excluded(sourceReports.blueGoals)}, ${sourceReports.blueGoals})`,
          orangeGoals: sql`coalesce(${excluded(sourceReports.orangeGoals)}, ${sourceReports.orangeGoals})`,
        },
      });
    writes.push(statementOf(db, report));
  }
  for (const row of departures.map((departure) => asStored(departure, now))) {
    const payload = JSON.stringify({ ...row, received: undefined });
    const id = await sha(JSON.stringify(['departure', sourceType, sourceId, payload]));
    const departure = query
      .insert(matchDepartures)
      .values({ id, matchGuid: row.match_guid, playerId: row.player_id, sourceId, sourceType, payload, received: now })
      .onConflictDoUpdate({
        target: matchDepartures.id,
        set: { received: sql`max(${matchDepartures.received}, ${excluded(matchDepartures.received)})` },
      });
    writes.push(statementOf(db, departure));
  }
  return writes;
}

export interface Alias {
  player_id: string;
  slot: string;
}

/**
 * Names a newly received namesake after the club player who confirmed its stable platform ID; until then it
 * stays unassigned. Resolving it later changes no historical source payload.
 */
export function aliasAssigner(roster: Roster, aliases: readonly Alias[]) {
  return <Row extends { name?: unknown; player_id?: unknown }>(row: Row): Row => {
    if (typeof row?.name !== 'string' || !row.name.startsWith('Non attribué · ')) return row;
    const alias = aliases.find(
      (candidate) => playerKey(candidate.player_id) === playerKey(row.player_id) && roster.includes(candidate.slot),
    );
    return alias ? { ...row, name: alias.slot } : row;
  };
}

export interface MatchSources {
  legacy: StoredResult[];
  observations: (Observation & { payload: string })[];
  rosters: CompleteRoster[];
  reports: (SourceReport & { players: string })[];
  /** Absent before departures were kept. */
  departures?: (Departure & { payload: string })[];
}

/** Reconciles every source received, with unassigned namesakes named after their confirmed player. */
export function mergeSources(roster: Roster, aliases: readonly Alias[], sources: MatchSources) {
  const assign = aliasAssigner(roster, aliases);
  const assignPayload = <Source extends { payload: string }>(source: Source): Source => {
    try {
      return { ...source, payload: JSON.stringify(assign(JSON.parse(source.payload))) };
    } catch {
      return source;
    }
  };
  const observations = sources.observations.map(assignPayload);
  const reports = sources.reports.map((report) => {
    try {
      return { ...report, players: JSON.stringify(JSON.parse(report.players).map(assign)) };
    } catch {
      return report;
    }
  });
  return reconcile(
    roster,
    sources.legacy.map(assign),
    observations,
    sources.rosters,
    reports,
    (sources.departures ?? []).map(assignPayload),
  );
}

/** Reconciles the whole history at once: the reference the stored match results must equal. */
export async function readMerged(db: Database, roster: Roster) {
  const query = orm(db);
  const [legacy, observations, rosters, reports, departures, aliases] = await Promise.all([
    query
      .select(sqlNamed(prototypeResults))
      .from(prototypeResults)
      .orderBy(desc(prototypeResults.day), desc(prototypeResults.received), desc(rowid)),
    query.select(sqlNamed(resultObservations)).from(resultObservations).orderBy(resultObservations.received, rowid),
    query.select(sqlNamed(prototypeMatchRosters)).from(prototypeMatchRosters),
    query.select(sqlNamed(sourceReports)).from(sourceReports).orderBy(sourceReports.received, rowid),
    query.select(sqlNamed(matchDepartures)).from(matchDepartures).orderBy(matchDepartures.received, rowid),
    query
      .select({ player_id: playerIdentityAliases.playerId, slot: playerIdentityAliases.slot })
      .from(playerIdentityAliases),
  ]);
  return mergeSources(roster, aliases, { legacy, observations, rosters, reports, departures });
}
