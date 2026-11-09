import { dailyRecap, defaultLastPlaceRules, dodgeRules, matchIndex } from '../../lib/domain';
import { formatClock } from '../../lib/format';
import { type HistoryMatch, matchHistory } from '../../lib/match-history';
import type { Board } from '../board';

// What the Matchs tab reads from the board: the day's summary per player, and the latest matches by part of day.

type Row = Board['results'][number];

export interface SummaryPlayer {
  name: string;
  me: boolean;
  /** Each match of the day, in the order played. */
  outcomes: ('win' | 'loss')[];
  wins: number;
  losses: number;
  /** Pushups the day adds: defeats, bonus, minus the dodged ones. */
  owed: number;
  bonus: number;
  /** Pushups off for wins the opponents forfeited and games from 1000 points. */
  dodged: number;
}

const historyOf = (board: Board, roster: readonly string[]) =>
  matchHistory(
    board.results.filter((row) => roster.includes(row.name) && row.kind === 'match'),
    board.results,
    matchIndex(board.results, board.matchRosters ?? []),
    roster,
    board.rules?.lastPlace ?? defaultLastPlaceRules,
    dodgeRules(board.rules),
  );

const byTime = (a: HistoryMatch<Row>, b: HistoryMatch<Row>) => (a.received ?? a.day).localeCompare(b.received ?? b.day);

/** The day's summary of each player who played that day, the member first. */
export function daySummary(board: Board, roster: readonly string[], me: string | null, day: string): SummaryPlayer[] {
  const recap = dailyRecap(
    [...roster],
    board.results,
    day,
    board.matchRosters ?? [],
    board.rules?.lastPlace ?? defaultLastPlaceRules,
    dodgeRules(board.rules),
  );
  const played = historyOf(board, roster)
    .filter((match) => match.day === day && !match.review)
    .sort(byTime);
  const players = recap.players
    .filter((player) => player.played > 0)
    .map((player) => ({
      name: player.name,
      me: player.name === me,
      outcomes: played.flatMap((match) =>
        match.players
          .filter(({ row }) => row.name === player.name)
          .map(({ row }) => (row.team === row.winner ? ('win' as const) : ('loss' as const))),
      ),
      wins: player.wins,
      losses: player.losses,
      owed: player.generated,
      bonus: player.bonus,
      dodged: player.dodged,
    }));
  return [...players.filter((player) => player.me), ...players.filter((player) => !player.me)];
}

export interface ReplayMatch {
  guid: string;
  outcome: HistoryMatch<Row>['outcome'];
  /** « 21:40 », or nothing when the reception time is unknown. */
  clock: string | null;
  tags: string[];
  /** The club's goals first. */
  score: [number, number] | null;
  players: { name: string; points: number; lastPlace: boolean; highScore: boolean; left: boolean; cost: number }[];
}

export interface ReplayGroup {
  label: string;
  matches: ReplayMatch[];
}

/** « Ce soir », « Cet après-midi », « Ce matin » today; « Le soir », « L’après-midi », « Le matin » another day. */
function partOf(match: HistoryMatch<Row>, today: boolean): string {
  if (!match.received) return today ? 'Aujourd’hui' : 'Dans la journée';
  const hour = Number(formatClock(match.received).slice(0, 2));
  if (hour < 12) return today ? 'Ce matin' : 'Le matin';
  return hour < 18 ? (today ? 'Cet après-midi' : 'L’après-midi') : today ? 'Ce soir' : 'Le soir';
}

/** What made the match special, in the words of the replay. */
function tagsOf(match: HistoryMatch<Row>): string[] {
  const tags: string[] = [];
  if (match.forfeit) tags.push(match.outcome === 'victory' ? 'Les adversaires ont FF' : 'FF');
  if (match.overtime) tags.push('Prolongation');
  if (match.left && !match.forfeit) tags.push('Un joueur est parti');
  return tags;
}

/** The matches of `day`, newest first, grouped by part of day. */
export function replay(board: Board, roster: readonly string[], day: string, today: string): ReplayGroup[] {
  const groups: ReplayGroup[] = [];
  for (const match of historyOf(board, roster)
    .filter((entry) => entry.day === day)
    .sort(byTime)
    .reverse()) {
    const label = partOf(match, day === today);
    let group = groups.at(-1);
    if (group?.label !== label) {
      group = { label, matches: [] };
      groups.push(group);
    }
    group.matches.push({
      guid: match.guid,
      outcome: match.outcome,
      clock: match.received ? formatClock(match.received) : null,
      tags: tagsOf(match),
      score: match.score,
      players: [...match.players]
        .sort((a, b) => b.row.score - a.row.score)
        .map(({ row, pushups, lastPlace, highScore, left }) => ({
          name: row.name,
          points: row.score,
          lastPlace,
          highScore,
          left,
          cost: pushups,
        })),
    });
  }
  return groups;
}

/** The days the club played a match, oldest first. */
export const playedDays = (board: Board, roster: readonly string[]): string[] =>
  [
    ...new Set(board.results.filter((row) => roster.includes(row.name) && row.kind === 'match').map((row) => row.day)),
  ].sort();
