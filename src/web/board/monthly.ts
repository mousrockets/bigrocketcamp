import { monthBounds, monthCloseGraceMs, nextMonth, parisMonth } from '../../lib/monthly-mmr';

// The month's challenge as the board sends it: the current ranking, the closed months and the drinks.

export type MonthlyRow = {
  player: string;
  mmr: number | null;
  recordedAt: string | null;
  confirmedForClose: boolean;
  /** The account the player counts with; absent from months closed before solo accounts counted. */
  account?: 'duo' | 'solo' | null;
};

export type MonthResult = {
  month: string;
  cutoffAt: string;
  lastDay: string;
  rows: MonthlyRow[];
  status: string;
  missing: string[];
  losers?: string[];
  closedAt?: string;
};
export type DrinkDebt = {
  id: string;
  month: string;
  payer: string;
  recipient: string;
  paidAt: string | null;
  canSettle: boolean;
  canUndo: boolean;
};
export type MonthlyState = {
  startsMonth: string;
  current: MonthResult;
  closed: MonthResult[];
  allowedPlayers: string[];
  debts: DrinkDebt[];
};

/** Whether a finished month waits to be closed: only then is the API asked to close it. */
export function closeIsDue(data: MonthlyState, now: number = Date.now()): boolean {
  const closed = new Set(data.closed.map((result) => result.month));
  const current = parisMonth(now);
  for (let month = data.startsMonth, step = 0; month < current && step < 24; month = nextMonth(month), step++) {
    if (!closed.has(month) && now >= Date.parse(monthBounds(month).cutoffAt) + monthCloseGraceMs) return true;
  }
  return false;
}
