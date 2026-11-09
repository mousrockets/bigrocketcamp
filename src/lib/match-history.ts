import type { Roster } from './club';
import {
  type DodgeRules,
  defaultDodgeRules,
  defaultLastPlaceRules,
  forfeitDodge,
  highScoreDodge,
  type IndexedMatch,
  type LastPlaceRules,
  lastPlaceBonus,
  type MatchRow,
} from './match-rules';

// The match history shows one entry per match, not one line per player: its result, its score, and what
// each club player present scored and owes.

export interface HistoryRow extends MatchRow {
  match_guid: string;
  player_id: string;
  goals?: number;
  received?: string;
  review_required?: boolean;
  /** The match went to overtime; null or absent while no source sent the game's clock. */
  overtime?: boolean | null;
}

export interface HistoryPlayer<Row extends HistoryRow> {
  row: Row;
  /**
   * What the match adds: 0 for a win, 5 for a defeat, 10 for the team's lowest club player, -5 for a win the
   * opponents forfeited, and 10 less for a game from 1000 points.
   */
  pushups: number;
  /** This player takes the extra 5 of the team's lowest club player. */
  lastPlace: boolean;
  /** This player dodges 5 pushups: the opponents forfeited. */
  dodged: boolean;
  /** This player dodges 10 pushups: 1000 points or more in the game. */
  highScore: boolean;
  /** This player left before the end: a defeat, whatever his team did after. */
  left: boolean;
}

export interface HistoryMatch<Row extends HistoryRow> {
  guid: string;
  day: string;
  /** When the match was received, close to when it ended. */
  received: string | null;
  kind: string;
  /** A source disagrees about the result: nothing counts until it is checked. */
  review: boolean;
  /** For the club: club players in both teams make a match between members. */
  outcome: 'victory' | 'defeat' | 'between-members' | 'review';
  /**
   * A player left before the end (a forfeit, a quit, a bot in their place): the scoreboard, received whole,
   * has fewer players on one side. It still counts like any other match.
   */
  left: boolean;
  /** The losing team forfeited: « Les adversaires ont FF » when the club won. False while the clock is unknown. */
  forfeit: boolean;
  /** The match went to overtime. False while the clock is unknown. */
  overtime: boolean;
  /** Goals of the club's team first, as received; null when the scoreboard holds no goals. */
  score: [number, number] | null;
  players: HistoryPlayer<Row>[];
}

/** Only a scoreboard a source sent whole tells who is missing: older ones may hold the club's rows alone. */
function someoneLeft(rows: readonly HistoryRow[], expected: number | null | undefined): boolean {
  if (expected !== rows.length || rows.some((row) => row.kind !== 'match')) return false;
  const sides = [0, 1].map((team) => rows.filter((row) => row.team === team).length);
  return sides[0] !== sides[1];
}

const goalsOf = (rows: readonly HistoryRow[], team: number) =>
  rows.filter((row) => row.team === team).reduce((sum, row) => sum + (row.goals ?? 0), 0);

/**
 * Groups the club's rows by match, newest first as the rows come. `scoreboard` holds every row received,
 * opponents included, for the score; `matches` is the match index the pushups are counted with.
 */
export function matchHistory<Row extends HistoryRow>(
  clubRows: readonly Row[],
  scoreboard: readonly HistoryRow[],
  matches: Map<string, IndexedMatch<Row>>,
  roster: Roster,
  rules: LastPlaceRules = defaultLastPlaceRules,
  dodge: DodgeRules = defaultDodgeRules,
): HistoryMatch<Row>[] {
  const byMatch = new Map<string, Row[]>();
  for (const row of clubRows) {
    const group = byMatch.get(row.match_guid);
    if (group) group.push(row);
    else byMatch.set(row.match_guid, [row]);
  }
  const everyone = new Map<string, HistoryRow[]>();
  for (const row of scoreboard) {
    const group = everyone.get(row.match_guid);
    if (group) group.push(row);
    else everyone.set(row.match_guid, [row]);
  }
  return [...byMatch].map(([guid, rows]) => {
    const [first] = rows as [Row, ...Row[]];
    // The match's result is that of the players present at the end; one who left lost it alone.
    const [decided = first] = rows.filter((row) => !row.left);
    const review = rows.some((row) => row.review_required);
    const teams = new Set(rows.map((row) => row.team));
    const outcome = review
      ? 'review'
      : teams.size > 1
        ? 'between-members'
        : decided.team === decided.winner
          ? 'victory'
          : 'defeat';
    const all = everyone.get(guid) ?? rows;
    const present = all.filter((row) => !row.left);
    // A goal still counts once its scorer has left: the score adds everyone, but only a final scoreboard gives one.
    const scorers = all.filter((row) => !row.left || !present.some((other) => other.player_id === row.player_id));
    const hasGoals = present.some((row) => typeof row.goals === 'number');
    const ours = teams.size === 1 ? first.team : 0;
    return {
      guid,
      day: first.day,
      received:
        rows
          .map((row) => row.received ?? '')
          .sort()
          .at(-1) || null,
      kind: first.kind,
      review,
      outcome,
      left: someoneLeft(present, matches.get(guid)?.expected),
      forfeit: rows.some((row) => row.forfeit === true),
      overtime: rows.some((row) => row.overtime === true),
      score: hasGoals ? [goalsOf(scorers, ours), goalsOf(scorers, 1 - ours)] : null,
      players: rows.map((row) => {
        const counted = !row.review_required && row.kind === 'match' && row.team !== row.winner;
        const bonus = counted ? lastPlaceBonus(row, matches, roster, rules) : 0;
        const forfeit = forfeitDodge(row, dodge.forfeit);
        const highScore = highScoreDodge(row, dodge.highScore);
        return {
          row,
          pushups: (counted ? 5 + bonus : 0) - forfeit - highScore,
          lastPlace: bonus > 0,
          dodged: forfeit > 0,
          highScore: highScore > 0,
          left: row.left === true,
        };
      }),
    };
  });
}
