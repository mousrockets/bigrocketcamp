import { says, z } from '../validation';
import type { Known } from './shared';

// The monthly 2v2 MMR standings, and the drinks the last of a month owes the others.

export const unknownAction = 'Action inconnue.';
export const invalidDebt = 'Dette invalide.';
export const monthlyAction = z.discriminatedUnion(
  'action',
  [
    z.object({ action: z.literal('refresh') }),
    z.object({
      action: z.enum(['settle', 'undo']),
      id: z.string(says(invalidDebt)).max(160, says(invalidDebt)),
    }),
  ],
  says(unknownAction),
);
export type MonthlyAction = z.input<typeof monthlyAction>;

export const monthlyRow = z.looseObject({
  player: z.string(),
  mmr: z.number().nullable(),
  recordedAt: z.string().nullable(),
  confirmedForClose: z.boolean(),
  /** The account the player counts with; absent from months closed before solo accounts counted. */
  account: z.enum(['duo', 'solo']).nullable().optional().catch(null),
});

const monthBounds = {
  month: z.string(),
  startAt: z.string(),
  lastDay: z.string(),
  lastDayStartAt: z.string(),
  cutoffAt: z.string(),
};

/** The month going on: the latest reading of each player. */
export const liveMonth = z.looseObject({
  ...monthBounds,
  rows: z.array(monthlyRow.required({ account: true })),
  status: z.literal('live'),
  missing: z.array(z.string()),
});

/** A closed month, as it was stored when it closed: older ones lack the fields added since. */
export const closedMonth = z.looseObject({
  ...monthBounds,
  startAt: z.string().optional(),
  lastDayStartAt: z.string().optional(),
  rows: z.array(monthlyRow),
  status: z.enum(['incomplete', 'tied', 'final']),
  missing: z.array(z.string()),
  losers: z.array(z.string()).optional(),
  closedAt: z.string(),
});
export type ClosedMonth = Known<z.output<typeof closedMonth>>;

export const drinkDebt = z.looseObject({
  id: z.string(),
  month: z.string(),
  payer: z.string(),
  recipient: z.string(),
  paidAt: z.string().nullable(),
  canSettle: z.boolean(),
  canUndo: z.boolean(),
});
export type DrinkDebt = Known<z.output<typeof drinkDebt>>;

export const monthlyStandings = z.looseObject({
  startsMonth: z.string(),
  current: liveMonth,
  closed: z.array(closedMonth),
  allowedPlayers: z.array(z.string()),
  debts: z.array(drinkDebt),
});
export type MonthlyStandings = Known<z.output<typeof monthlyStandings>>;

/** The answer to `refresh`: how many finished months it closed. */
export const monthsClosed = z.looseObject({ ok: z.boolean(), closed: z.number().catch(0), month: z.string() });
export type MonthsClosed = Known<z.output<typeof monthsClosed>>;
