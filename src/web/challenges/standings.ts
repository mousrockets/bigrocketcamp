import { weekStart } from '../../lib/days';
import { type CountedExercise, pushupCredit } from '../../lib/domain';
import type { Board } from '../board';
import { splitRankLabel } from '../team/stats';

type DoublesRank = Board['doublesRanks'][number];
export type DrinkDebt = NonNullable<Board['monthly']>['debts'][number];

// What Défis derives from the board: the week's podium, the month's 2v2 standings, the time left before they close.

export interface PodiumStep {
  name: string;
  me: boolean;
  /** Pushups and their equivalents since Monday. */
  pushups: number;
  /** 1 to 3; players level on pushups share a step. */
  rank: number;
}

/**
 * The week's three strongest arms: every exercise since Monday, Paris time, counted in pushups. A player who did
 * nothing yet stays off the podium.
 */
export function weeklyPodium(
  exercises: readonly (CountedExercise & { player: string; day: string })[],
  roster: readonly string[],
  me: string | null,
  today: string,
): PodiumStep[] {
  const monday = weekStart(today);
  const totals = roster
    .map((name) => ({
      name,
      me: name === me,
      pushups: exercises
        .filter((exercise) => exercise.player === name && exercise.day >= monday && exercise.day <= today)
        .reduce((sum, exercise) => sum + pushupCredit(exercise), 0),
    }))
    .filter((player) => player.pushups > 0)
    .sort((a, b) => b.pushups - a.pushups || roster.indexOf(a.name) - roster.indexOf(b.name));
  return totals
    .slice(0, 3)
    .map((player) => ({ ...player, rank: 1 + totals.filter((other) => other.pushups > player.pushups).length }));
}

export interface MonthlyRow {
  player: string;
  mmr: number | null;
  account?: 'duo' | 'solo' | null;
}

export interface StandingLine {
  player: string;
  me: boolean;
  /** Players level on MMR share a position. */
  position: number;
  mmr: number | null;
  account: 'duo' | 'solo' | null;
  /** The current rank of the account that counts, or null while none was read. */
  rank: { name: string; tier: number } | null;
  /** The last of the month, who owes the others a drink each. */
  pays: boolean;
}

/**
 * Who would pay if the month closed now: the last one alone. Nobody while a player has no reading, since the close
 * then owes nothing, nor when several share the last place.
 */
export function payerOf(rows: readonly MonthlyRow[]): string | null {
  if (rows.length < 2 || rows.some((row) => row.mmr === null)) return null;
  const lowest = Math.min(...rows.map((row) => row.mmr ?? 0));
  const last = rows.filter((row) => row.mmr === lowest);
  return last.length === 1 ? (last[0]?.player ?? null) : null;
}

function accountRank(ranks: DoublesRank | undefined, account: StandingLine['account']): StandingLine['rank'] {
  const read = account === 'solo' ? ranks?.solo : account === 'duo' ? ranks : null;
  if (!read || read.tier === null || read.mmr === null) return null;
  return { name: splitRankLabel(read.label).rank, tier: read.tier };
}

/** The month's rows as the API ranked them, best first, with the rank of the account each player counts with. */
export function standingLines(
  rows: readonly MonthlyRow[],
  doublesRanks: readonly DoublesRank[],
  me: string | null,
): StandingLine[] {
  const payer = payerOf(rows);
  return rows.map((row) => ({
    player: row.player,
    me: row.player === me,
    position: 1 + rows.filter((other) => (other.mmr ?? -1) > (row.mmr ?? -1)).length,
    mmr: row.mmr,
    account: row.account ?? null,
    rank: accountRank(
      doublesRanks.find((ranks) => ranks.player === row.player),
      row.account ?? null,
    ),
    pays: row.player === payer,
  }));
}

/** The time left before `cutoffAt`, in whole minutes; nothing once it passed. */
export function countdown(cutoffAt: string, now: number): { days: number; hours: number; minutes: number } {
  const minutes = Math.max(0, Math.floor((Date.parse(cutoffAt) - now) / 60_000));
  return { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60 };
}

/**
 * The drinks still to offer, and the ones the member just marked offered while they can take that back. A paid drink
 * past its undo window has nothing left to do.
 */
export const openDebts = (debts: readonly DrinkDebt[]): DrinkDebt[] =>
  debts.filter((debt) => debt.paidAt === null || debt.canUndo);
