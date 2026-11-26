import { z } from '../validation';
import { seasonPeak } from './board';
import type { Known } from './shared';

// The Stats page's own answer: each account's MMR over each season, read only when the page opens, as it goes
// through the whole rating history.

/** An account's MMR over a season: its first and last reading, and its highest one with its rank. */
export const seasonMmr = z.looseObject({
  player: z.string(),
  /** "duo" or "solo"; an app ignores an account it does not know. */
  account: z.string(),
  season: z.number(),
  first: z.number(),
  last: z.number(),
  peak: seasonPeak,
});
export type SeasonMmr = Known<z.output<typeof seasonMmr>>;

export const seasonMmrList = z.looseObject({
  seasons: z.array(seasonMmr),
  /** The game's words for each stat feed event, by its name; absent from an API older than them. */
  statfeedLabels: z.record(z.string(), z.string()).catch({}),
});
export type SeasonMmrList = Known<z.output<typeof seasonMmrList>>;

/** Zen's latest ranked 2v2 rating, the mark above Supersonic Legend; null until the rank source read it. */
export const zenAnswer = z.looseObject({
  zen: z.looseObject({ name: z.string(), mmr: z.number(), fetchedAt: z.string() }).nullable().catch(null),
});
export type ZenAnswer = Known<z.output<typeof zenAnswer>>;
