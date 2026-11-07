import { parisDay, shiftDay } from '../../lib/days';
import { dailyRecap, defaultLastPlaceRules, matchIndex } from '../../lib/domain';
import { formatClock, formatLongDay } from '../../lib/format';
import { type HistoryMatch, matchHistory } from '../../lib/match-history';
import type { Board } from '../board';

// What the Matchs tab reads from the board: the day's summary per player, and the latest matches by part of day.

type Row = Board['results'][number];

/** How long the replay looks back. */
const replayDays = 7;

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
}

const historyOf = (board: Board, roster: readonly string[]) =>
  matchHistory(
    board.results.filter((row) => roster.includes(row.name) && row.kind === 'match'),
    board.results,
    matchIndex(board.results, board.matchRosters ?? []),
    roster,
    board.rules?.lastPlace ?? defaultLastPlaceRules,
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
  players: { name: string; points: number; lastPlace: boolean; cost: number }[];
}

export interface ReplayGroup {
  label: string;
  matches: ReplayMatch[];
}

/** « Ce soir », « Cet après-midi », « Ce matin », « Hier », then the day in full. */
function partOf(match: HistoryMatch<Row>, today: string): string {
  if (match.day === shiftDay(today, -1)) return 'Hier';
  if (match.day !== today) return formatLongDay(`${match.day}T12:00:00Z`);
  if (!match.received) return 'Aujourd’hui';
  const hour = Number(formatClock(match.received).slice(0, 2));
  return hour < 12 ? 'Ce matin' : hour < 18 ? 'Cet après-midi' : 'Ce soir';
}

/** The matches of the last days, newest first, grouped by part of day. */
export function replay(board: Board, roster: readonly string[], now: number): ReplayGroup[] {
  const today = parisDay(now);
  const since = shiftDay(today, 1 - replayDays);
  const groups: ReplayGroup[] = [];
  for (const match of historyOf(board, roster)
    .filter((entry) => entry.day >= since)
    .sort(byTime)
    .reverse()) {
    const label = partOf(match, today);
    let group = groups.at(-1);
    if (group?.label !== label) {
      group = { label, matches: [] };
      groups.push(group);
    }
    group.matches.push({
      guid: match.guid,
      outcome: match.outcome,
      clock: match.received ? formatClock(match.received) : null,
      tags: match.left ? ['Un joueur est parti'] : [],
      score: match.score,
      players: [...match.players]
        .sort((a, b) => b.row.score - a.row.score)
        .map(({ row, pushups, lastPlace }) => ({ name: row.name, points: row.score, lastPlace, cost: pushups })),
    });
  }
  return groups;
}
