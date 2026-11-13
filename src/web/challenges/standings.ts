import { shiftDay, weekStart } from '../../lib/days';
import { type CountedExercise, pushupCredit } from '../../lib/domain';
import type { Board } from '../board';

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
 * The three strongest arms of the week of `day`: every exercise from its Monday to its Sunday, Paris time, counted in
 * pushups. Only a player who did something climbs on the podium: a step nobody earned stays empty.
 */
export function weeklyPodium(
  exercises: readonly (CountedExercise & { player: string; day: string })[],
  roster: readonly string[],
  me: string | null,
  day: string,
): PodiumStep[] {
  const monday = weekStart(day);
  const sunday = shiftDay(monday, 6);
  const totals = roster
    .map((name) => ({
      name,
      me: name === me,
      pushups: exercises
        .filter((exercise) => exercise.player === name && exercise.day >= monday && exercise.day <= sunday)
        .reduce((sum, exercise) => sum + pushupCredit(exercise), 0),
    }))
    .filter((player) => player.pushups > 0)
    .sort((a, b) => b.pushups - a.pushups || roster.indexOf(a.name) - roster.indexOf(b.name));
  return totals
    .slice(0, 3)
    .map((player) => ({ ...player, rank: 1 + totals.filter((other) => other.pushups > player.pushups).length }));
}

/** The Monday of the first week with an exercise, or null before the first one. */
export function firstWeek(exercises: readonly { day: string }[]): string | null {
  const first = exercises.reduce<string | null>(
    (earliest, { day }) => (earliest && earliest <= day ? earliest : day),
    null,
  );
  return first && weekStart(first);
}

export interface MonthlyRow {
  player: string;
  mmr: number | null;
  account?: 'duo' | 'solo' | null | undefined;
  duo?: number | null | undefined;
  solo?: number | null | undefined;
}

/** The MMR a player still needs to pass the position just above theirs. */
export interface Gap {
  mmr: number;
  position: number;
}

export interface StandingLine {
  player: string;
  me: boolean;
  /** Players level on MMR share a position. */
  position: number;
  mmr: number | null;
  account: 'duo' | 'solo' | null;
  /** The last of the month, who owes the others a drink each. */
  pays: boolean;
  /** Each account's MMR in the sum, when the month summed them. */
  accounts: { duo: number | null; solo: number | null } | null;
  /** What it takes to climb one position; null for the first, or a player not read yet. */
  gap: Gap | null;
}

function gapOf(rows: readonly MonthlyRow[], mmr: number | null): Gap | null {
  if (mmr === null) return null;
  const above = rows.flatMap((row) => (row.mmr !== null && row.mmr > mmr ? [row.mmr] : []));
  if (!above.length) return null;
  const target = Math.min(...above);
  return { mmr: target - mmr + 1, position: 1 + rows.filter((row) => (row.mmr ?? -1) > target).length };
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

/** The month's rows as the API ranked them, best first. */
export function standingLines(rows: readonly MonthlyRow[], me: string | null): StandingLine[] {
  const payer = payerOf(rows);
  return rows.map((row) => ({
    player: row.player,
    me: row.player === me,
    position: 1 + rows.filter((other) => (other.mmr ?? -1) > (row.mmr ?? -1)).length,
    mmr: row.mmr,
    account: row.account ?? null,
    pays: row.player === payer,
    accounts: row.duo == null && row.solo == null ? null : { duo: row.duo ?? null, solo: row.solo ?? null },
    gap: gapOf(rows, row.mmr),
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
