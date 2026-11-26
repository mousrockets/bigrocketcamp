import { and, eq, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import type { Database } from './db';
import { orm } from './orm';
import type { ObservedRank, RankReport, SoloTarget } from './rank-source';
import { zenRank } from './schema';

// Zen is the best 2v2 player there is: the club's ladder ends on his rating, above Supersonic Legend. His account is a
// public pro player's, named here by a maintainer's choice (AGENTS.md). The rank source reads it as it reads a solo
// account, from its Epic name, once a day at most; only its latest reading is kept, as his history is not the club's.

export const zen = { player: '~zen', name: 'zenrll' } as const;

const dayMs = 86_400_000;

const targetOf = (playerId: string | null): SoloTarget => ({
  player: zen.player,
  kind: 'solo',
  platform: 'Epic',
  name: zen.name,
  playerId,
});

/** Zen's account as the rank source reads it: what a reading of it must match. */
export async function zenTarget(db: Database): Promise<SoloTarget> {
  const row = await orm(db)
    .select({ playerId: zenRank.playerId })
    .from(zenRank)
    .where(eq(zenRank.player, zen.player))
    .get();
  return targetOf(row?.playerId ?? null);
}

/**
 * Zen's account, when a day went by since the rank source was last asked to read it; asking marks the day, so that
 * a reading that fails waits for the next day too.
 */
export async function dueZenTarget(db: Database, now: number = Date.now()): Promise<SoloTarget | null> {
  const askedAt = new Date(now).toISOString();
  const [asked] = await orm(db)
    .insert(zenRank)
    .values({ player: zen.player, askedAt })
    .onConflictDoUpdate({
      target: zenRank.player,
      set: { askedAt },
      // Raw: Drizzle's or() may answer undefined, which an upsert's condition does not take.
      setWhere: sql`${zenRank.askedAt} IS NULL OR ${zenRank.askedAt} <= ${new Date(now - dayMs).toISOString()}`,
    })
    .returning({ playerId: zenRank.playerId });
  return asked ? targetOf(asked.playerId) : null;
}

/** Sets Zen's reading apart from the club's: it keeps no history and counts in no challenge. */
export function withoutZen(report: RankReport): { club: RankReport; zen: ObservedRank | null } {
  const isZen = (player: string) => player === zen.player;
  return {
    club: {
      ...report,
      ranks: report.ranks.filter((rank) => !isZen(rank.player)),
      unresolved: report.unresolved.filter((account) => !isZen(account.player)),
    },
    zen: report.ranks.findLast((rank) => isZen(rank.player)) ?? null,
  };
}

/** Keeps Zen's latest reading, never an older one. */
export async function recordZen(db: Database, rank: ObservedRank): Promise<void> {
  await orm(db)
    .update(zenRank)
    .set({ playerId: rank.playerId, mmr: rank.mmr, tier: rank.tier, fetchedAt: rank.observedAt })
    .where(and(eq(zenRank.player, zen.player), or(isNull(zenRank.fetchedAt), lte(zenRank.fetchedAt, rank.observedAt))));
}

export interface ZenReading {
  name: string;
  mmr: number;
  fetchedAt: string;
}

/** Zen's latest rating, once the rank source read it. */
export async function readZen(db: Database): Promise<ZenReading | null> {
  const row = await orm(db)
    .select({ mmr: zenRank.mmr, fetchedAt: zenRank.fetchedAt })
    .from(zenRank)
    .where(and(eq(zenRank.player, zen.player), isNotNull(zenRank.mmr), isNotNull(zenRank.fetchedAt)))
    .get();
  return row?.mmr != null && row.fetchedAt ? { name: zen.name, mmr: row.mmr, fetchedAt: row.fetchedAt } : null;
}
