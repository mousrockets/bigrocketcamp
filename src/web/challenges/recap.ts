import type { ClosedMonth } from '../../lib/contract/monthly';
import { lastDayOf, shiftMonth } from '../../lib/days';
import { defaultLastPlaceRules, dodgeRules, pushupCredit, summarize } from '../../lib/domain';
import type { Board } from '../board';
import { type Career, careerOf } from '../team/career';
import { soloReading, stepOfMmr } from '../team/ladder';
import { highestTier } from '../team/stats';

// What the monthly recap tells of a month gone by, read from the board alone: the club's matches and pushups, who
// led, the streaks, the climb of the monthly challenge, the fun stats, and the member's own month.

/** The players who share the best value of the month; a tie keeps them all. */
export interface Leader {
  players: string[];
  value: number;
}

export interface MonthRecap {
  month: string;
  /** Something happened: a match played or an exercise declared. */
  active: boolean;
  club: { matches: number; wins: number; losses: number; pushups: number };
  /** Most pushups done in the month, in pushups and their equivalents. */
  mvp: Leader | null;
  /** The biggest debt left on the month's last day. */
  debt: Leader | null;
  winStreak: Leader | null;
  lossStreak: Leader | null;
  /** The most MMR won in the monthly challenge, from the month before; ranks on the 2v2 ladder when both are known. */
  climb: (Leader & { from: number | null; to: number | null }) | null;
  /** Who paid the drinks of the month's challenge, once it closed. */
  verdict: { status: 'final' | 'tied' | 'incomplete'; payers: string[] } | null;
  fun: { demos: number | null; crossbars: number | null; overtimes: number; forfeits: number };
  /** The member's own month; null when they did nothing in it. */
  mine: (Career & { pushups: number; place: number }) | null;
}

type Result = Board['results'][number];

const inMonth = (month: string) => (item: { day: string }) => item.day.startsWith(`${month}-`);

/** A club member's line of a match no source disputes. */
const clubLine = (roster: readonly string[]) => (row: Result) =>
  roster.includes(row.name) && row.kind === 'match' && !row.review_required;

function leaderOf(values: { player: string; value: number }[]): Leader | null {
  const best = Math.max(0, ...values.map(({ value }) => value));
  if (best <= 0) return null;
  return { players: values.filter(({ value }) => value === best).map(({ player }) => player), value: best };
}

const sum = (values: { value: number }[]) => values.reduce((total, { value }) => total + value, 0);

const added = (total: number | null, value: number | null | undefined) =>
  typeof value === 'number' ? (total ?? 0) + value : total;

/** Whether the month has anything to tell: a match of a member, or an exercise. */
export const hasRecap = (board: Board, roster: readonly string[], month: string): boolean =>
  board.results.some((row) => inMonth(month)(row) && clubLine(roster)(row)) ||
  board.exercises.some((exercise) => inMonth(month)(exercise) && roster.includes(exercise.player));

export interface RecapMonth {
  month: string;
  matches: number;
  pushups: number;
}

/** Every month before `current` with something to tell, newest first. */
export function recapMonths(board: Board, roster: readonly string[], current: string): RecapMonth[] {
  const months = new Map<string, { matches: Set<string>; pushups: number }>();
  const monthOf = (day: string) => {
    const month = day.slice(0, 7);
    const held = months.get(month) ?? { matches: new Set<string>(), pushups: 0 };
    months.set(month, held);
    return held;
  };
  for (const row of board.results.filter(clubLine(roster))) monthOf(row.day).matches.add(row.match_guid);
  for (const exercise of board.exercises.filter((candidate) => roster.includes(candidate.player))) {
    monthOf(exercise.day).pushups += pushupCredit(exercise);
  }
  return [...months]
    .filter(([month]) => month < current)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, { matches, pushups }]) => ({ month, matches: matches.size, pushups }));
}

/** A player's colour: their highest current rank, duo or solo. */
export function tierOf(board: Board, player: string): number | null {
  const ranks = board.doublesRanks.find((rank) => rank.player === player);
  return highestTier(ranks?.tier, soloReading(ranks)?.tier);
}

function clubMonth(lines: Result[]) {
  const won = new Map<string, boolean>();
  const overtimes = new Set<string>();
  const forfeits = new Set<string>();
  let demos: number | null = null;
  let crossbars: number | null = null;
  for (const row of lines) {
    const victory = !row.left && row.team === row.winner;
    won.set(row.match_guid, (won.get(row.match_guid) ?? false) || victory);
    if (row.overtime) overtimes.add(row.match_guid);
    // The losing team forfeited: the club's FF when the member lost it.
    if (row.forfeit && row.team !== row.winner) forfeits.add(row.match_guid);
    demos = added(demos, row.demos);
    crossbars = added(crossbars, row.crossbar_hits);
  }
  const wins = [...won.values()].filter(Boolean).length;
  return {
    matches: won.size,
    wins,
    losses: won.size - wins,
    fun: { demos, crossbars, overtimes: overtimes.size, forfeits: forfeits.size },
  };
}

function climbOf(board: Board, month: string): MonthRecap['climb'] {
  const closed: ClosedMonth[] = board.monthly?.closed ?? [];
  const now = closed.find((candidate) => candidate.month === month);
  const before = closed.find((candidate) => candidate.month === shiftMonth(month, -1));
  if (!now || !before) return null;
  const gains = now.rows.flatMap((row) => {
    const earlier = before.rows.find((candidate) => candidate.player === row.player);
    if (row.mmr === null || earlier?.mmr == null) return [];
    return [{ player: row.player, value: row.mmr - earlier.mmr, from: earlier.duo, to: row.duo }];
  });
  const leader = leaderOf(gains);
  if (!leader) return null;
  const [only] = leader.players.length === 1 ? gains.filter((gain) => gain.player === leader.players[0]) : [];
  return {
    ...leader,
    from: only?.from == null ? null : stepOfMmr(only.from).tier,
    to: only?.to == null ? null : stepOfMmr(only.to).tier,
  };
}

function verdictOf(board: Board, month: string): MonthRecap['verdict'] {
  const closed = board.monthly?.closed.find((candidate) => candidate.month === month);
  if (!closed) return null;
  return { status: closed.status, payers: closed.status === 'final' ? (closed.losers ?? []) : [] };
}

export function monthRecap(board: Board, roster: readonly string[], me: string | null, month: string): MonthRecap {
  const results = board.results.filter(inMonth(month));
  const lines = results.filter(clubLine(roster));
  const exercises = board.exercises.filter(inMonth(month));
  const club = clubMonth(lines);
  const monthBoard = { ...board, results };
  const careers = roster.map((player) => ({ player, career: careerOf(monthBoard, player, 'all') }));
  const pushups = roster.map((player) => ({
    player,
    value: exercises
      .filter((exercise) => exercise.player === player)
      .reduce((sum, exercise) => sum + pushupCredit(exercise), 0),
  }));
  // The debts as they stood when the month ended.
  const lastDay = lastDayOf(month);
  const debts = summarize(
    [...roster],
    board.results.filter((row) => row.day <= lastDay),
    board.exercises.filter((exercise) => exercise.day <= lastDay),
    lastDay,
    board.matchRosters ?? [],
    board.rules?.lastPlace ?? defaultLastPlaceRules,
    dodgeRules(board.rules),
  ).map((stat) => ({ player: stat.name, value: stat.remaining }));

  const myCareer = careers.find(({ player }) => player === me)?.career;
  const myPushups = pushups.find(({ player }) => player === me)?.value ?? 0;
  return {
    month,
    active: lines.length > 0 || pushups.some(({ value }) => value > 0),
    club: { matches: club.matches, wins: club.wins, losses: club.losses, pushups: sum(pushups) },
    mvp: leaderOf(pushups),
    debt: leaderOf(debts),
    winStreak: leaderOf(careers.map(({ player, career }) => ({ player, value: career.winStreak }))),
    lossStreak: leaderOf(careers.map(({ player, career }) => ({ player, value: career.lossStreak }))),
    climb: climbOf(board, month),
    verdict: verdictOf(board, month),
    fun: club.fun,
    mine:
      myCareer && (myCareer.matches > 0 || myPushups > 0)
        ? {
            ...myCareer,
            pushups: myPushups,
            place: 1 + pushups.filter(({ value }) => value > myPushups).length,
          }
        : null,
  };
}
