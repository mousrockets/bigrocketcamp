import { shiftDay } from '../../lib/days';
import { dailyRecap, defaultLastPlaceRules, dodgeRules, matchIndex } from '../../lib/domain';
import { formatClock, formatRecentDay } from '../../lib/format';
import { type HistoryMatch, matchHistory, partiedAccounts } from '../../lib/match-history';
import type { Board } from '../board';

// What the Matchs tab reads from the board: each player's summary over the days shown, and their matches, by day
// or by part of day.

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
  accounts: Accounts;
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

// A match received late (an import, a source catching up) still belongs to its own day.
const byTime = (a: HistoryMatch<Row>, b: HistoryMatch<Row>) =>
  a.day.localeCompare(b.day) || (a.received ?? a.day).localeCompare(b.received ?? b.day);

/** How many days Matchs shows when no day is chosen. */
export const recentDays = 7;

/** The days Matchs shows when no day is chosen: the last week, today included, oldest first. */
export const lastDays = (today: string): string[] =>
  Array.from({ length: recentDays }, (_, index) => shiftDay(today, index + 1 - recentDays));

/** Each player's solo account, once the rank source found it: its game ID, in lower case, and its pseudo. */
function soloAccounts(board: Board): Map<string, { id: string; pseudo: string }> {
  return new Map(
    board.doublesRanks.flatMap(({ player, solo }) =>
      solo?.playerId && solo.pseudo
        ? [[player, { id: solo.playerId.toLowerCase(), pseudo: solo.pseudo }] as const]
        : [],
    ),
  );
}

const playedSolo = (accounts: ReturnType<typeof soloAccounts>, row: Row) =>
  accounts.get(row.name)?.id === row.player_id.toLowerCase();

/** Which of the player's accounts their matches were played on. */
export type Accounts = 'duo' | 'solo' | 'both';

const outcomeOf = (row: Row) => (row.team === row.winner ? ('win' as const) : ('loss' as const));

/** The summary of each player who played on those days, added up over them, the member first. */
export function periodSummary(
  board: Board,
  roster: readonly string[],
  me: string | null,
  days: readonly string[],
): SummaryPlayer[] {
  const played = historyOf(board, roster)
    .filter((match) => days.includes(match.day) && !match.review)
    .sort(byTime);
  const solo = soloAccounts(board);
  const accountsOf = (name: string): Accounts => {
    const rows = played.flatMap((match) => match.players.filter(({ row }) => row.name === name).map(({ row }) => row));
    const onSolo = rows.filter((row) => playedSolo(solo, row)).length;
    return onSolo === 0 ? 'duo' : onSolo === rows.length ? 'solo' : 'both';
  };
  const totals = new Map<string, SummaryPlayer>();
  for (const day of days) {
    const recap = dailyRecap(
      [...roster],
      board.results,
      day,
      board.matchRosters ?? [],
      board.rules?.lastPlace ?? defaultLastPlaceRules,
      dodgeRules(board.rules),
    );
    for (const player of recap.players.filter((candidate) => candidate.played > 0)) {
      const total = totals.get(player.name) ?? {
        name: player.name,
        me: player.name === me,
        outcomes: played.flatMap((match) =>
          match.players.filter(({ row }) => row.name === player.name).map(({ row }) => outcomeOf(row)),
        ),
        wins: 0,
        losses: 0,
        owed: 0,
        bonus: 0,
        dodged: 0,
        accounts: accountsOf(player.name),
      };
      total.wins += player.wins;
      total.losses += player.losses;
      total.owed += player.generated;
      total.bonus += player.bonus;
      total.dodged += player.dodged;
      totals.set(player.name, total);
    }
  }
  const players = roster.flatMap((name) => totals.get(name) ?? []);
  return [...players.filter((player) => player.me), ...players.filter((player) => !player.me)];
}

export interface ReplayMatch {
  guid: string;
  outcome: HistoryMatch<Row>['outcome'];
  /** « 21:40 », or nothing when the reception time is unknown. */
  clock: string | null;
  tags: string[];
  mode: HistoryMatch<Row>['mode'];
  /** The club's goals first. */
  score: [number, number] | null;
  players: {
    name: string;
    /** The pseudo of the account the match was played on: the player's own, or their solo account's. */
    account: string;
    points: number;
    lastPlace: boolean;
    highScore: boolean;
    left: boolean;
    mvp: boolean;
    /** Played in a group: with a club player, or with the same stranger several matches in a row. */
    party: boolean;
    cost: number;
  }[];
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

/**
 * The matches of those days, newest first: grouped by part of day for a single day, by day for several.
 */
export function replay(board: Board, roster: readonly string[], days: readonly string[], today: string): ReplayGroup[] {
  const groups: ReplayGroup[] = [];
  const solo = soloAccounts(board);
  const partied = partiedAccounts(board.results, roster);
  for (const match of historyOf(board, roster)
    .filter((entry) => days.includes(entry.day))
    .sort(byTime)
    .reverse()) {
    const label = days.length === 1 ? partOf(match, match.day === today) : formatRecentDay(match.day, today);
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
      mode: match.mode,
      score: match.score,
      players: [...match.players]
        .sort((a, b) => b.row.score - a.row.score)
        .map(({ row, pushups, lastPlace, highScore, left, mvp }) => ({
          name: row.name,
          account: playedSolo(solo, row) ? (solo.get(row.name)?.pseudo ?? row.name) : row.name,
          points: row.score,
          lastPlace,
          highScore,
          left,
          mvp,
          party: partied.get(match.guid)?.has(row.player_id) ?? false,
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
