/** A result row, as stored (`match_guid`) or as received (`matchGuid`). */
export interface MatchRow {
  match_guid?: string;
  matchGuid?: string;
  player_id?: string;
  playerId?: string;
  name: string;
  day: string;
  kind: string;
  team: number;
  winner: number;
  score: number;
  review_required?: boolean;
}

export interface RosterSize {
  match_guid?: string;
  matchGuid?: string;
  expected_players?: number;
  playerCount?: number;
}

export interface IndexedMatch<Row extends MatchRow> {
  players: Map<string, Row>;
  complete: boolean;
  minimum: number | null;
  last: Row[];
}

export interface LastPlaceRule {
  enabled: boolean;
  effectiveFrom: string;
  ties: 'none' | 'all';
}

// Only explicitly complete scoreboards can produce a last-place classification.
export const lastPlaceRule: LastPlaceRule = { enabled: false, effectiveFrom: '2026-11-05', ties: 'none' };

const guid = (row: MatchRow | RosterSize) => row.match_guid ?? row.matchGuid;
const identity = (row: MatchRow) => row.player_id ?? row.playerId ?? row.name;

export function matchIndex<Row extends MatchRow>(
  rows: Row[],
  rosters: RosterSize[] = [],
): Map<string, IndexedMatch<Row>> {
  const expected = new Map(rosters.map((roster) => [guid(roster), roster.expected_players ?? roster.playerCount]));
  const matches = new Map<string, IndexedMatch<Row>>();
  for (const row of rows) {
    const id = guid(row);
    if (row.kind !== 'match' || row.review_required || typeof id !== 'string' || !id) continue;
    let match = matches.get(id);
    if (!match) {
      match = { players: new Map(), complete: false, minimum: null, last: [] };
      matches.set(id, match);
    }
    const key = identity(row);
    const previous = match.players.get(key);
    if (!previous || row.score > previous.score) match.players.set(key, row);
  }
  for (const [id, match] of matches) {
    const players = [...match.players.values()];
    const count = expected.get(id);
    match.complete =
      typeof count === 'number' &&
      Number.isSafeInteger(count) &&
      count >= 2 &&
      count <= 16 &&
      players.length === count &&
      new Set(players.map((row) => row.team)).size === 2 &&
      new Set(players.map((row) => row.day)).size === 1 &&
      new Set(players.map((row) => row.winner)).size === 1 &&
      players.every(
        (row) =>
          [0, 1].includes(row.team) && [0, 1].includes(row.winner) && Number.isSafeInteger(row.score) && row.score >= 0,
      );
    match.minimum = match.complete ? Math.min(...players.map((row) => row.score)) : null;
    match.last = match.complete ? players.filter((row) => row.score === match.minimum) : [];
  }
  return matches;
}

export function lastPlaceBonus<Row extends MatchRow>(
  row: Row,
  matches: Map<string, IndexedMatch<Row>>,
  rule: LastPlaceRule = lastPlaceRule,
): number {
  const id = guid(row);
  const match = id === undefined ? undefined : matches.get(id);
  return rule.enabled &&
    row.day >= rule.effectiveFrom &&
    row.team !== row.winner &&
    match?.complete &&
    row.score === match.minimum &&
    (rule.ties === 'all' || match.last.length === 1)
    ? 5
    : 0;
}

export interface ReceivedRoster {
  matchGuid: string;
  playerCount: number;
}

export function validateMatchRosters(
  input: unknown,
  rows: { matchGuid: string; playerId: string; team: number; day: string; winner: number }[],
): ReceivedRoster[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 250) throw new Error('Liste de participants invalide.');
  const seen = new Set<string>();
  return input.map((match: { MatchGuid?: unknown; PlayerCount?: unknown } | null) => {
    const matchGuid = match?.MatchGuid;
    const playerCount = match?.PlayerCount;
    if (
      typeof matchGuid !== 'string' ||
      seen.has(matchGuid) ||
      typeof playerCount !== 'number' ||
      !Number.isSafeInteger(playerCount) ||
      playerCount < 2 ||
      playerCount > 16
    ) {
      throw new Error('Liste de participants invalide.');
    }
    seen.add(matchGuid);
    const players = rows.filter((row) => row.matchGuid === matchGuid);
    const unique = new Set(players.map((row) => row.playerId));
    if (
      players.length !== playerCount ||
      unique.size !== playerCount ||
      new Set(players.map((row) => row.team)).size !== 2 ||
      new Set(players.map((row) => row.day)).size !== 1 ||
      new Set(players.map((row) => row.winner)).size !== 1
    ) {
      throw new Error('Tableau des scores incomplet ou incohérent.');
    }
    return { matchGuid, playerCount };
  });
}
