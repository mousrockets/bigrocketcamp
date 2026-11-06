import type { Roster } from './club';
import { type IndexedMatch, lastPlaceBonus, type MatchRow } from './match-rules';

// The match history shows one entry per match, not one line per player: its result, its score, and what
// each club player present scored and owes.

export interface HistoryRow extends MatchRow {
  match_guid: string;
  player_id: string;
  goals?: number;
  received?: string;
  review_required?: boolean;
}

export interface HistoryPlayer<Row extends HistoryRow> {
  row: Row;
  /** What the match adds: 0 for a win, 5 for a defeat, 10 for the team's lowest club player. */
  pushups: number;
  /** This player takes the extra 5 of the team's lowest club player. */
  lastPlace: boolean;
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
    const review = rows.some((row) => row.review_required);
    const teams = new Set(rows.map((row) => row.team));
    const outcome = review
      ? 'review'
      : teams.size > 1
        ? 'between-members'
        : first.team === first.winner
          ? 'victory'
          : 'defeat';
    const all = everyone.get(guid) ?? rows;
    const hasGoals = all.some((row) => typeof row.goals === 'number');
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
      left: someoneLeft(all, matches.get(guid)?.expected),
      score: hasGoals ? [goalsOf(all, ours), goalsOf(all, 1 - ours)] : null,
      players: rows.map((row) => {
        const counted = !row.review_required && row.kind === 'match' && row.team !== row.winner;
        const bonus = counted ? lastPlaceBonus(row, matches, roster) : 0;
        return { row, pushups: counted ? 5 + bonus : 0, lastPlace: bonus > 0 };
      }),
    };
  });
}
