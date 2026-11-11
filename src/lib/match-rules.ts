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
  /**
   * The player left before the end: a defeat with no bonus nor credit, apart from the final scoreboard. Absent
   * from rows kept from an API older than departures.
   */
  left?: boolean;
}

export interface RosterSize {
  match_guid?: string;
  matchGuid?: string;
  expected_players?: number;
  playerCount?: number;
}

export interface IndexedMatch<Row extends MatchRow> {
  players: Map<string, Row>;
  /** Every player of the scoreboard a source sent whole is here, even when a forfeit left a single team on it. */
  whole: boolean;
  /** Whole, with both teams. */
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
export const identity = (row: MatchRow) => row.player_id ?? row.playerId ?? row.name;

export function matchIndex<Row extends MatchRow>(
  rows: Row[],
  rosters: RosterSize[] = [],
): Map<string, IndexedMatch<Row>> {
  const expected = new Map(rosters.map((roster) => [guid(roster), roster.expected_players ?? roster.playerCount]));
  const matches = new Map<string, IndexedMatch<Row>>();
  for (const row of rows) {
    const id = guid(row);
    // A player who left is not on the final scoreboard: the match's completeness and places ignore him.
    if (row.kind !== 'match' || row.review_required || row.left || typeof id !== 'string' || !id) continue;
    let match = matches.get(id);
    if (!match) {
      const count = expected.get(id);
      match = { players: new Map(), whole: false, complete: false, expected: typeof count === 'number' ? count : null };
      matches.set(id, match);
    }
    const key = identity(row);
    const previous = match.players.get(key);
    if (!previous || row.score > previous.score) match.players.set(key, row);
  }
  for (const [id, match] of matches) {
    const players = [...match.players.values()];
    const count = expected.get(id);
    match.whole =
      typeof count === 'number' &&
      Number.isSafeInteger(count) &&
      count >= 1 &&
      count <= 16 &&
      players.length === count &&
      new Set(players.map((row) => row.day)).size === 1 &&
      new Set(players.map((row) => row.winner)).size === 1 &&
      players.every(
        (row) =>
          [0, 1].includes(row.team) && [0, 1].includes(row.winner) && Number.isSafeInteger(row.score) && row.score >= 0,
      );
    match.complete = match.whole && new Set(players.map((row) => row.team)).size === 2;
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
  if (mates.length < 2 || !roster.includes(row.name) || row.left)
    return { compared: false, lowest: false, tied: false };
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
  if (!rule.enabled || row.team === row.winner || row.left) return 0;
  const place = teamPlace(row, matches, roster);
  return place.lowest && (rule.ties === 'all' || !place.tied) ? 5 : 0;
}

/** The −5 of a win the opponents forfeited, as it applies from `effectiveFrom` (a day in Paris). */
export interface ForfeitRule {
  enabled: boolean;
  effectiveFrom: string;
}

/** Every change of the −5, oldest first: a match counts with the rule of its own day, never a later one. */
export type ForfeitRules = readonly ForfeitRule[];

// The −5 applied from the first forfeit ever known (collector 0.3.0): before any change, it is on.
export const defaultForfeitRules: ForfeitRules = [];

const forfeitAlways: ForfeitRule = { enabled: true, effectiveFrom: '' };

/** The −5 in force on a day: the latest change made effective on or before it, or on before any change. */
export function forfeitRuleOn(rules: ForfeitRules, day: string): ForfeitRule {
  return rules.reduce(
    (current, rule) => (rule.effectiveFrom <= day && rule.effectiveFrom >= current.effectiveFrom ? rule : current),
    forfeitAlways,
  );
}

/**
 * « Si les adversaires FF, 5 pompes de moins »: a win the opponents forfeited takes 5 pushups off each club
 * player of the winning team, on the days the club keeps the rule. Only a match whose clock a source sent can
 * be known as a forfeit.
 */
export function forfeitDodge(row: MatchRow, rules: ForfeitRules = defaultForfeitRules): number {
  const won =
    row.kind === 'match' && !row.review_required && !row.left && row.team === row.winner && row.forfeit === true;
  return won && forfeitRuleOn(rules, row.day).enabled ? 5 : 0;
}

/** The −10 of a game of 1000 points or more, as it applies from `effectiveFrom` (a day in Paris). */
export interface HighScoreRule {
  enabled: boolean;
  effectiveFrom: string;
}

/** Every change of the −10, oldest first: a match counts with the rule of its own day, never a later one. */
export type HighScoreRules = readonly HighScoreRule[];

/** Points a player must reach in a game to dodge pushups. */
export const highScorePoints = 1000;

// The −10 starts on 2026-11-07, the evening the club decided it. The club changes it in its settings; until the
// API says otherwise (an older API, an empty board), this applies.
export const defaultHighScoreRules: HighScoreRules = [{ enabled: true, effectiveFrom: '2026-11-07' }];

const noHighScore: HighScoreRule = { enabled: false, effectiveFrom: '' };

/** The −10 in force on a day: the latest change made effective on or before it, off before the first one. */
export function highScoreRuleOn(rules: HighScoreRules, day: string): HighScoreRule {
  return rules.reduce(
    (current, rule) => (rule.effectiveFrom <= day && rule.effectiveFrom >= current.effectiveFrom ? rule : current),
    noHighScore,
  );
}

/**
 * « Si un joueur dépasse 1000 points pendant une game, il esquive 10 pompes. Qu'ils perdent ou qu'ils gagnent »,
 * from 1000 points included, as the club set it the day after: a club player with 1000 points or more in a counted match takes 10 pushups off, win or loss, on the days the club
 * keeps the rule.
 */
export function highScoreDodge(row: MatchRow, rules: HighScoreRules = defaultHighScoreRules): number {
  const counted = row.kind === 'match' && !row.review_required && !row.left && row.score >= highScorePoints;
  return counted && highScoreRuleOn(rules, row.day).enabled ? 10 : 0;
}

/** The rules that take pushups off, each with its history. */
export interface DodgeRules {
  forfeit: ForfeitRules;
  highScore: HighScoreRules;
}

export const defaultDodgeRules: DodgeRules = { forfeit: defaultForfeitRules, highScore: defaultHighScoreRules };

/** The rules that take pushups off, from a board or a club kept by an older API: a rule left out gets its default. */
export const dodgeRules = (rules?: Partial<DodgeRules>): DodgeRules => ({
  forfeit: rules?.forfeit ?? defaultForfeitRules,
  highScore: rules?.highScore ?? defaultHighScoreRules,
});

/** The pushups a match takes off a club player: they lower the debt, and count for later defeats. */
export function dodgedPushups(row: MatchRow, rules: DodgeRules = defaultDodgeRules): number {
  return forfeitDodge(row, rules.forfeit) + highScoreDodge(row, rules.highScore);
}

export interface ReceivedRoster {
  matchGuid: string;
  playerCount: number;
  /** The clock the source read at the end of the match: absent from older collectors. */
  timeSeconds?: number;
  overtime?: boolean;
  /** The clock's changes around the end as the collector saw them (JSON): absent from older collectors. */
  clockTrace?: string;
  /** Every opponent left before the end, as the source's departures show: absent when they do not. */
  opponentsGone?: boolean;
  /** The goals of each team as the game counted them, those of players who left included: absent from older sources. */
  blueGoals?: number;
  orangeGoals?: number;
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
