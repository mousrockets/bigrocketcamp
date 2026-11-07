import { asc, gte } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { parisDay } from './days';
import type { Database } from './db';
import {
  type ForfeitRule,
  type ForfeitRules,
  forfeitRuleOn,
  type LastPlaceRule,
  type LastPlaceRules,
  lastPlaceRuleOn,
} from './match-rules';
import { orm } from './orm';
import { forfeitRules, lastPlaceRules } from './schema';

// The challenge rules are club settings with a history: a change applies from the next day in Paris, so the
// matches already played, today's included, keep the pushups they were counted with.

export interface ChallengeRules {
  lastPlace: LastPlaceRules;
  forfeit: ForfeitRules;
}

/** What an admin asks for each rule from tomorrow on; a rule left out stays as it is. */
export interface RuleChoice {
  lastPlace?: boolean | undefined;
  forfeit?: boolean | undefined;
}

/** The day after a day (YYYY-MM-DD). */
export function dayAfter(day: string): string {
  const next = new Date(`${day}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export async function readChallengeRules(db: Database): Promise<ChallengeRules> {
  const query = orm(db);
  const [lastPlace, forfeit]: [LastPlaceRule[], ForfeitRule[]] = await Promise.all([
    query
      .select({
        effectiveFrom: lastPlaceRules.effectiveFrom,
        enabled: lastPlaceRules.enabled,
        ties: lastPlaceRules.ties,
      })
      .from(lastPlaceRules)
      .orderBy(asc(lastPlaceRules.effectiveFrom)),
    query
      .select({ effectiveFrom: forfeitRules.effectiveFrom, enabled: forfeitRules.enabled })
      .from(forfeitRules)
      .orderBy(asc(forfeitRules.effectiveFrom)),
  ]);
  return { lastPlace, forfeit };
}

/**
 * Turns the +5 or the −5 on or off from tomorrow, both in one batch; asking again for today's rule cancels a
 * change still to come.
 */
export async function changeChallengeRules(
  db: Database,
  choice: RuleChoice,
  today: string = parisDay(),
): Promise<ChallengeRules> {
  const from = dayAfter(today);
  const rules = await readChallengeRules(db);
  const query = orm(db);
  const writes: BatchItem<'sqlite'>[] = [];
  if (choice.lastPlace !== undefined) {
    const inForce = lastPlaceRuleOn(rules.lastPlace, today);
    writes.push(query.delete(lastPlaceRules).where(gte(lastPlaceRules.effectiveFrom, from)));
    if (inForce.enabled !== choice.lastPlace) {
      writes.push(
        query.insert(lastPlaceRules).values({ effectiveFrom: from, enabled: choice.lastPlace, ties: inForce.ties }),
      );
    }
  }
  if (choice.forfeit !== undefined) {
    writes.push(query.delete(forfeitRules).where(gte(forfeitRules.effectiveFrom, from)));
    if (forfeitRuleOn(rules.forfeit, today).enabled !== choice.forfeit) {
      writes.push(query.insert(forfeitRules).values({ effectiveFrom: from, enabled: choice.forfeit }));
    }
  }
  const [first, ...rest] = writes;
  if (!first) return rules;
  await query.batch([first, ...rest]);
  return readChallengeRules(db);
}
