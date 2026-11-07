import { type ShapedReport, unresolvedReasons } from '../rank-source';
import { says, z } from '../validation';
import type { Known } from './shared';

// For the instance's rank source only, authenticated by its own key: what to read, and the ranks it read.
// Rules that need the database (a target of the rank source) stay in the routes.

export const invalidRanks = 'Relevé de rangs invalide.';
const rankNumber = (min: number, max: number) =>
  z.int(says(invalidRanks)).min(min, says(invalidRanks)).max(max, says(invalidRanks));
const reading = z.object({
  player: z.string(says(invalidRanks)),
  playerId: z.string(says(invalidRanks)),
  mmr: rankNumber(0, 10_000),
  tier: rankNumber(0, 22).nullable().default(null),
  division: rankNumber(1, 4).nullable().default(null),
  matches: rankNumber(0, 1_000_000).nullable().default(null),
  // At most a day old, never ahead of the clock by more than a minute.
  observedAt: z
    .string(says(invalidRanks))
    .refine((date) => Number.isFinite(Date.parse(date)), says(invalidRanks))
    .transform((date) => Date.parse(date))
    .refine((observed) => observed <= Date.now() + 60_000 && observed >= Date.now() - 86_400_000, says(invalidRanks))
    .transform((observed) => new Date(observed).toISOString()),
});
/** A source that predates solo accounts sends no kind: its readings are duo ones. */
const duoReading = reading.extend({ kind: z.literal('duo').default('duo') });
/** A solo reading names the pseudo its ID was found from. */
const soloReading = reading.extend({ kind: z.literal('solo'), name: z.string().nullish() });
const unresolvedSolo = z.object({
  player: z.string(),
  kind: z.literal('solo'),
  name: z.string(),
  reason: z.enum(unresolvedReasons),
});
const isDuo = (raw: unknown) => {
  const kind = (raw as { kind?: unknown } | null)?.kind;
  return kind === undefined || kind === 'duo';
};
/**
 * A rank source's report. A bad duo reading refuses it: the source is broken. A bad solo reading or unread
 * account is only dropped, so a solo account never stops the duo ranks.
 */
export const rankReport = z
  .object({
    ranks: z.array(z.unknown(), says(invalidRanks)).max(100, says(invalidRanks)),
    unresolved: z.array(z.unknown()).max(100).catch([]).default([]),
  })
  .transform(({ ranks, unresolved }, context) => {
    const report: ShapedReport = { ranks: [], unresolved: [], ignored: 0 };
    for (const raw of ranks) {
      const parsed = (isDuo(raw) ? duoReading : soloReading).safeParse(raw);
      if (parsed.success) report.ranks.push(parsed.data);
      else if (!isDuo(raw)) report.ignored++;
      else {
        context.issues.push({ code: 'custom', message: invalidRanks, input: raw });
        return z.NEVER;
      }
    }
    for (const raw of unresolved) {
      const parsed = unresolvedSolo.safeParse(raw);
      if (parsed.success) report.unresolved.push(parsed.data);
      else report.ignored++;
    }
    return report;
  });

/** A player's duo account, read by its game ID. */
const duoTarget = z.looseObject({ player: z.string(), kind: z.literal('duo'), playerId: z.string() });
/** A player's solo account, named by the solo pseudo of their profile; its game ID is null until found. */
const soloTarget = z.looseObject({
  player: z.string(),
  kind: z.literal('solo'),
  /** PsyNet's prefix of the profile's platform. */
  platform: z.string().optional(),
  name: z.string(),
  playerId: z.string().nullable(),
});
export const rankTarget = z.discriminatedUnion('kind', [duoTarget, soloTarget]);

/** What to read; the time of the last ranked match also tells that this app gives it. */
export const rankTargets = z.looseObject({
  targets: z.array(rankTarget),
  lastRankedMatchAt: z.string().nullable(),
});
export type RankTargets = Known<z.output<typeof rankTargets>>;

export const rankActivity = z.looseObject({
  lastRankedMatchAt: z.string().nullable(),
  lastReadAt: z.string().nullable(),
});
export type RankActivity = Known<z.output<typeof rankActivity>>;

export const ranksRecorded = z.looseObject({ ok: z.boolean(), changed: z.number(), ignored: z.number() });
export type RanksRecorded = Known<z.output<typeof ranksRecorded>>;
