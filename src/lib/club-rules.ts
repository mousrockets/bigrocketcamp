import { asc, gte } from 'drizzle-orm';
import type { Database } from './db';
import { parisDay } from './domain';
import { type LastPlaceRule, type LastPlaceRules, lastPlaceRuleOn } from './match-rules';
import { orm } from './orm';
import { lastPlaceRules } from './schema';

// The challenge rules are club settings with a history: a change applies from the next day in Paris, so the
// matches already played, today's included, keep the pushups they were counted with.

export interface ChallengeRules {
  lastPlace: LastPlaceRules;
}

/** The day after a day (YYYY-MM-DD). */
export function dayAfter(day: string): string {
  const next = new Date(`${day}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export async function readChallengeRules(db: Database): Promise<ChallengeRules> {
  const lastPlace: LastPlaceRule[] = await orm(db)
    .select({
      effectiveFrom: lastPlaceRules.effectiveFrom,
      enabled: lastPlaceRules.enabled,
      ties: lastPlaceRules.ties,
    })
    .from(lastPlaceRules)
    .orderBy(asc(lastPlaceRules.effectiveFrom));
  return { lastPlace };
}

/** Turns the +5 on or off from tomorrow; asking again for today's rule cancels a change still to come. */
export async function changeLastPlaceRule(
  db: Database,
  enabled: boolean,
  today: string = parisDay(),
): Promise<ChallengeRules> {
  const from = dayAfter(today);
  const { lastPlace } = await readChallengeRules(db);
  const inForce = lastPlaceRuleOn(lastPlace, today);
  const query = orm(db);
  const forgetComing = query.delete(lastPlaceRules).where(gte(lastPlaceRules.effectiveFrom, from));
  if (inForce.enabled === enabled) {
    await forgetComing;
  } else {
    await query.batch([
      forgetComing,
      query.insert(lastPlaceRules).values({ effectiveFrom: from, enabled, ties: inForce.ties }),
    ]);
  }
  return readChallengeRules(db);
}
