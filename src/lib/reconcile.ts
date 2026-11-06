import { roster } from './club';
import type { Database, Statement } from './db';
import type { ReceivedRoster } from './match-rules';

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
  received?: string;
}

export interface MergedResult extends StoredResult {
  received: string;
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
  legacy: StoredResult[],
  observations: Observation[] = [],
  legacyRosters: CompleteRoster[] = [],
  reports: SourceReport[] = [],
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
  rows = keep.sort(
    (a, b) =>
      b.day.localeCompare(a.day) ||
      (b.received || '').localeCompare(a.received || '') ||
      a.match_guid.localeCompare(b.match_guid) ||
      a.player_id.localeCompare(b.player_id),
  );
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
  const groupRows = rows.filter((row) => roster.includes(row.name) && row.kind === 'match');
  return {
    rows,
    rosters: complete,
    reliability: {
      confirmed: groupRows.filter((row) => row.verification === 'confirmed').length,
      single: groupRows.filter((row) => row.verification === 'single').length,
      corrected: groupRows.filter((row) => row.verification === 'corrected').length,
      review: groupRows.filter((row) => row.review_required).length,
    },
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
    sourceId,
    sourceType,
  }: { rows: ReceivedRow[]; rosters?: ReceivedRoster[]; sourceId: string; sourceType: string },
  now: string,
): Promise<Statement[]> {
  if (!['collector', 'epic'].includes(sourceType)) throw new Error('Source invalide.');
  const stored = rows.map((row) => asStored(row, now));
  const writes: Statement[] = [];
  for (const row of stored) {
    const payload = JSON.stringify({ ...row, received: undefined });
    const id = await sha(JSON.stringify([sourceType, sourceId, payload]));
    writes.push(
      db
        .prepare(
          'INSERT INTO result_observations (id,match_guid,player_id,source_id,source_type,payload,received) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET received=MAX(result_observations.received,excluded.received)',
        )
        .bind(id, row.match_guid, row.player_id, sourceId, sourceType, payload, now),
    );
  }
  for (const roster of rosters) {
    const players = stored
      .filter((row) => row.match_guid === matchKey(roster.matchGuid))
      .map((row) => ({ ...row, received: undefined }))
      .sort((a, b) => a.player_id.localeCompare(b.player_id));
    const payload = JSON.stringify(players);
    const id = await sha(JSON.stringify([sourceType, sourceId, roster.matchGuid, payload]));
    writes.push(
      db
        .prepare(
          'INSERT INTO source_reports (id,match_guid,source_id,source_type,expected_players,players,received) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET received=MAX(source_reports.received,excluded.received)',
        )
        .bind(id, matchKey(roster.matchGuid), sourceId, sourceType, roster.playerCount, payload, now),
    );
  }
  return writes;
}

export async function readMerged(db: Database) {
  const [legacy, observations, rosters, reports, aliases] = await Promise.all([
    db.prepare('SELECT * FROM results ORDER BY day DESC,received DESC,rowid DESC').all<StoredResult>(),
    db.prepare('SELECT * FROM result_observations ORDER BY received').all<Observation & { payload: string }>(),
    db.prepare('SELECT * FROM match_rosters').all<CompleteRoster>(),
    db.prepare('SELECT * FROM source_reports ORDER BY received').all<SourceReport & { players: string }>(),
    db.prepare('SELECT player_id,slot FROM player_identity_aliases').all<{ player_id: string; slot: string }>(),
  ]);
  // A newly received namesake remains unassigned until the member confirms its
  // stable platform ID. Resolving it later changes no historical source payload.
  const assign = <Row extends { name?: unknown; player_id?: unknown }>(row: Row): Row => {
    if (typeof row?.name !== 'string' || !row.name.startsWith('Non attribué · ')) return row;
    const alias = aliases.results.find(
      (candidate) => playerKey(candidate.player_id) === playerKey(row.player_id) && roster.includes(candidate.slot),
    );
    return alias ? { ...row, name: alias.slot } : row;
  };
  const mappedObservations = observations.results.map((observation) => {
    try {
      return { ...observation, payload: JSON.stringify(assign(JSON.parse(observation.payload))) };
    } catch {
      return observation;
    }
  });
  const mappedReports = reports.results.map((report) => {
    try {
      return { ...report, players: JSON.stringify(JSON.parse(report.players).map(assign)) };
    } catch {
      return report;
    }
  });
  return reconcile(legacy.results.map(assign), mappedObservations, rosters.results, mappedReports);
}
