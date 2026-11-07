import { type ExerciseType, pushupCredit } from '../../lib/domain';

// What the declaration sheet counts in: pushups and crunches one by one, the plank in minutes. The API counts the
// plank in seconds; a minute of plank is worth 15 pushups, 20 crunches are worth 10.

interface Kind {
  label: string;
  /** What the big figure counts, after it. */
  unit: string;
  /** The amount the sheet opens with. */
  start: number;
  /** One tap of − or +. */
  step: number;
  quick: readonly [number, number, number];
}

export const kinds: Record<ExerciseType, Kind> = {
  pushups: { label: 'Pompes', unit: 'pompes', start: 10, step: 5, quick: [5, 10, 20] },
  plank: { label: 'Gainage', unit: 'min de gainage', start: 1, step: 0.25, quick: [0.25, 0.5, 1] },
  crunches: { label: 'Abdos', unit: 'abdos', start: 20, step: 10, quick: [10, 20, 40] },
};

export const kindOrder: readonly ExerciseType[] = ['pushups', 'plank', 'crunches'];

/** Adds without the floating point drift of quarters of a minute. */
export const plus = (amount: number, delta: number): number => Math.round((amount + delta) * 100) / 100;

/** One step less, never below one step. */
export const minus = (type: ExerciseType, amount: number): number =>
  Math.max(kinds[type].step, plus(amount, -kinds[type].step));

/** What the API receives: repetitions, or whole seconds for the plank. */
export const apiCount = (type: ExerciseType, amount: number): number =>
  type === 'plank' ? Math.round(amount * 60) : Math.round(amount);

/** The pushups an amount is worth. */
export const pushupsOf = (type: ExerciseType, amount: number): number =>
  pushupCredit({ type, count: apiCount(type, amount) });

/** The amount that pays everything owed: the plank by quarters of a minute, rounded up. */
export function payoff(type: ExerciseType, owed: number): number {
  if (type === 'plank') return Math.max(kinds.plank.step, Math.ceil((owed / 15) * 4) / 4);
  if (type === 'crunches') return Math.max(kinds.crunches.step, Math.ceil(owed * 2));
  return Math.max(kinds.pushups.step, Math.ceil(owed));
}
