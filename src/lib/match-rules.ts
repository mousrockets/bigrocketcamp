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
}

export interface LastPlaceRule {
  enabled: boolean;
  effectiveFrom: string;
  ties: 'none' | 'all';
}

// On a defeat, the club player with the fewest points among the club players of their team does 5 more pushups.
export const lastPlaceRule: LastPlaceRule = { enabled: true, effectiveFrom: '2026-11-06', ties: 'none' };

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
      match = { players: new Map(), complete: false };
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
  }
  return matches;
}

export interface TeamPlace {
  /** At least two club players were in this player's team, so they can be compared. */
  compared: boolean;
  lowest: boolean;
  tied: boolean;
}

/** Where a club player finished among the club players of their own team: opponents and strangers never count. */
export function teamPlace<Row extends MatchRow>(
  row: Row,
  matches: Map<string, IndexedMatch<Row>>,
  roster: readonly string[],
): TeamPlace {
  const id = guid(row);
  const match = id === undefined ? undefined : matches.get(id);
  const mates = match
    ? [...match.players.values()].filter((player) => player.team === row.team && roster.includes(player.name))
    : [];
  if (mates.length < 2 || !roster.includes(row.name)) return { compared: false, lowest: false, tied: false };
  const lowestScore = Math.min(...mates.map((player) => player.score));
  const atLowest = mates.filter((player) => player.score === lowestScore).length;
  return { compared: true, lowest: row.score === lowestScore, tied: row.score === lowestScore && atLowest > 1 };
}

export function lastPlaceBonus<Row extends MatchRow>(
  row: Row,
  matches: Map<string, IndexedMatch<Row>>,
  roster: readonly string[],
  rule: LastPlaceRule = lastPlaceRule,
): number {
  if (!rule.enabled || row.day < rule.effectiveFrom || row.team === row.winner) return 0;
  const place = teamPlace(row, matches, roster);
  return place.lowest && (rule.ties === 'all' || !place.tied) ? 5 : 0;
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
      playerCount < 1 ||
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
      // A forfeit can leave a single team on the scoreboard.
      !players.every((row) => row.team === 0 || row.team === 1) ||
      new Set(players.map((row) => row.day)).size !== 1 ||
      new Set(players.map((row) => row.winner)).size !== 1
    ) {
      throw new Error('Tableau des scores incomplet ou incohérent.');
    }
    return { matchGuid, playerCount };
  });
}
