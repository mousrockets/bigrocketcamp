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
  /** The losing team forfeited; null or absent while no source sent the game's clock. */
  forfeit?: boolean | null;
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
  /** How many players a source reported on the scoreboard it sent whole; null when none did. */
  expected: number | null;
}

/** The +5 as it applies from `effectiveFrom` (a day in Paris) until the next change. */
export interface LastPlaceRule {
  enabled: boolean;
  effectiveFrom: string;
  ties: 'none' | 'all';
}

/** Every change of the +5, oldest first: a match counts with the rule of its own day, never a later one. */
export type LastPlaceRules = readonly LastPlaceRule[];

// On a defeat, the club player with the fewest points among the club players of their team does 5 more pushups.
// The club changes it in its settings; until the API says otherwise (an older API, an empty board), this applies.
export const defaultLastPlaceRules: LastPlaceRules = [{ enabled: true, effectiveFrom: '2026-11-06', ties: 'none' }];

const noLastPlace: LastPlaceRule = { enabled: false, effectiveFrom: '', ties: 'none' };

/** The rule in force on a day: the latest change made effective on or before it. */
export function lastPlaceRuleOn(rules: LastPlaceRules, day: string): LastPlaceRule {
  return rules.reduce(
    (current, rule) => (rule.effectiveFrom <= day && rule.effectiveFrom >= current.effectiveFrom ? rule : current),
    noLastPlace,
  );
}

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
      const count = expected.get(id);
      match = { players: new Map(), complete: false, expected: typeof count === 'number' ? count : null };
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
  rules: LastPlaceRules = defaultLastPlaceRules,
): number {
  const rule = lastPlaceRuleOn(rules, row.day);
  if (!rule.enabled || row.team === row.winner) return 0;
  const place = teamPlace(row, matches, roster);
  return place.lowest && (rule.ties === 'all' || !place.tied) ? 5 : 0;
}

/**
 * « Si les adversaires FF, 5 pompes de moins »: a win the opponents forfeited takes 5 pushups off each club
 * player of the winning team. Only a match whose clock a source sent can be known as a forfeit.
 */
export function dodgedPushups(row: MatchRow): number {
  return row.kind === 'match' && !row.review_required && row.team === row.winner && row.forfeit === true ? 5 : 0;
}

export interface ReceivedRoster {
  matchGuid: string;
  playerCount: number;
  /** The clock the source read at the end of the match: absent from older collectors. */
  timeSeconds?: number;
  overtime?: boolean;
}

/** How a match ended; null when no source sent the clock (older collectors, Epic's history). */
export interface MatchEnding {
  /** The losing team forfeited: the match ended with time left on the clock. */
  forfeit: boolean | null;
  overtime: boolean | null;
}

export const unknownEnding: MatchEnding = { forfeit: null, overtime: null };

/**
 * A match that ends with time left, outside overtime, ended by the losers' forfeit. The clock counts up in
 * overtime, so a forfeit there cannot be told from a goal: it is an overtime.
 */
export function endingOf(clock: {
  timeSeconds?: number | null | undefined;
  overtime?: boolean | null | undefined;
}): MatchEnding {
  if (typeof clock.overtime !== 'boolean') return unknownEnding;
  if (clock.overtime) return { forfeit: false, overtime: true };
  return { forfeit: typeof clock.timeSeconds === 'number' ? clock.timeSeconds > 0 : null, overtime: false };
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
