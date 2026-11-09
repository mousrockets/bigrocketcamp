import { shiftDay } from '../../lib/days';

// What L'équipe derives from the board: streaks, the debt gauge, rank names and colours, whether someone plays.

/** Days in a row with an exercise, ending today, or yesterday while today's is still to come. */
export function currentStreak(days: ReadonlySet<string>, today: string): number {
  let streak = 0;
  for (let day = days.has(today) ? today : shiftDay(today, -1); days.has(day); day = shiftDay(day, -1)) streak++;
  return streak;
}

export interface Debt {
  /** Pushups still owed. */
  left: number;
  /** Pushups paid, counted up to what is owed. */
  paid: number;
  owed: number;
  /** Share paid, 0 to 100; nothing owed counts as all paid. */
  percent: number;
}

export function debtOf({ due: counted, done }: { due: number; done: number }): Debt {
  // Dodged pushups (wins the opponents forfeited) can bring what is owed below zero: nothing is owed then.
  const due = Math.max(0, counted);
  const paid = Math.min(done, due);
  return { left: due - paid, paid, owed: due, percent: due > 0 ? Math.round((paid / due) * 100) : 100 };
}

/** How many of the gauge's segments are lit. */
export const litSegments = (percent: number, segments: number): number =>
  Math.min(segments, Math.max(0, Math.round((percent / 100) * segments)));

/** The rank and its division, which the cards show on two lines: "Champion III · Division II". */
export function splitRankLabel(label: string): { rank: string; division: string } {
  const [rank = label, division = ''] = label.split(' · ');
  return { rank, division };
}

/** The division as the season peak line writes it: "Champion III · Div. II". */
export const shortRankLabel = (label: string): string => label.replace(' · Division ', ' · Div. ');

/**
 * The colours of a rank's family, as "r,g,b": `rgb` tints a card, `light` draws what shines on it, like a progress
 * bar. The design draws Diamond, Champion and Grand Champion; the lower ranks and Supersonic Legend follow the colours
 * of their icons.
 */
const families = [
  { from: 1, rgb: '176,110,60', light: '222,160,108' }, // Bronze
  { from: 4, rgb: '160,170,185', light: '204,212,224' }, // Silver
  { from: 7, rgb: '226,178,64', light: '246,208,118' }, // Gold
  { from: 10, rgb: '86,196,200', light: '136,226,228' }, // Platinum
  { from: 13, rgb: '39,163,230', light: '108,196,240' }, // Diamond
  { from: 16, rgb: '158,115,220', light: '196,162,238' }, // Champion
  { from: 19, rgb: '150,68,78', light: '255,138,148' }, // Grand Champion
  { from: 22, rgb: '225,225,240', light: '240,240,250' }, // Supersonic Legend
];
const unrankedRgb = '120,120,132';
const unrankedLightRgb = '170,170,182';

const familyOf = (tier: number | null | undefined) =>
  tier ? families.findLast((family) => tier >= family.from) : undefined;

export const rankRgb = (tier: number | null | undefined): string => familyOf(tier)?.rgb ?? unrankedRgb;

/** The rank's colour where it shines on its own tint. */
export const rankLightRgb = (tier: number | null | undefined): string => familyOf(tier)?.light ?? unrankedLightRgb;

/** A player's colour is their highest current rank, solo or duo. */
export const highestTier = (...tiers: (number | null | undefined)[]): number | null =>
  tiers.reduce<number | null>((best, tier) => (tier && tier > (best ?? 0) ? tier : best), null);

/** The latest of several readings, or null when none was made. */
export const latest = (...dates: (string | null | undefined)[]): string | null =>
  dates.reduce<string | null>((last, date) => (date && (!last || date > last) ? date : last), null);
