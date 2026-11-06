import { roster } from './club';
import type { Database, Statement } from './db';
import { projectMmrRankWrite } from './mmr-ledger';

// A rank source is a separate service that reads the players' ranked 2v2 rating and posts it here.
// The app only stores what it receives: how the source reads the ranks is none of its business.

export interface RankTarget {
  player: string;
  playerId: string;
}

export interface ObservedRank {
  player: string;
  playerId: string;
  mmr: number;
  tier: number | null;
  division: number | null;
  observedAt: string;
}

const integerIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;

export async function readRankTargets(db: Database): Promise<RankTarget[]> {
  const identities = await db
    .prepare('SELECT slot, player_id FROM player_identities')
    .all<{ slot: string; player_id: string }>();
  return identities.results
    .filter((identity) => roster.includes(identity.slot))
    .map((identity) => ({ player: identity.slot, playerId: identity.player_id }));
}

export function validateObservedRanks(input: unknown, targets: RankTarget[], now: number = Date.now()): ObservedRank[] {
  if (!Array.isArray(input) || input.length > 50) throw new Error('Relevé de rangs invalide.');
  return input.map((raw: Record<string, unknown> | null) => {
    const { player, playerId, mmr, tier = null, division = null, observedAt } = raw ?? {};
    const target = targets.find((candidate) => candidate.player === player && candidate.playerId === playerId);
    const observed = typeof observedAt === 'string' ? Date.parse(observedAt) : Number.NaN;
    if (
      !target ||
      !integerIn(mmr, 0, 10_000) ||
      (tier !== null && !integerIn(tier, 0, 22)) ||
      (division !== null && !integerIn(division, 1, 4)) ||
      !Number.isFinite(observed) ||
      observed > now + 60_000 ||
      observed < now - 86_400_000
    ) {
      throw new Error('Relevé de rangs invalide.');
    }
    return {
      player: target.player,
      playerId: target.playerId,
      mmr: mmr as number,
      tier: tier as number | null,
      division: division as number | null,
      observedAt: new Date(observed).toISOString(),
    };
  });
}

async function entryId(rank: ObservedRank): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${rank.player}|${rank.observedAt}|${rank.mmr}`),
  );
  return `observer-${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 40)}`;
}

/**
 * Keeps a new rating entry only when the rating changed, so the history stays short
 * (the monthly ranking reads all of it), and marks the rank as freshly read either way.
 */
export async function recordObservedRanks(db: Database, ranks: ObservedRank[]): Promise<{ changed: number }> {
  const writes: Statement[] = [];
  let changed = 0;
  for (const rank of ranks) {
    const latest = await db
      .prepare(
        "SELECT mmr, tier, division FROM mmr_entries WHERE player = ? ORDER BY CASE WHEN source='rlstats' THEN source_at ELSE recorded_at END DESC, recorded_at DESC, rowid DESC LIMIT 1",
      )
      .bind(rank.player)
      .first<{ mmr: number; tier: number | null; division: number | null }>();
    const unchanged =
      latest && latest.mmr === rank.mmr && latest.tier === rank.tier && latest.division === rank.division;
    if (unchanged) {
      writes.push(
        db
          .prepare(
            "UPDATE player_ranks SET fetched_at = ?, last_attempt = ?, status = 'ready' WHERE player = ? AND playlist = 11",
          )
          .bind(rank.observedAt, rank.observedAt, rank.player),
      );
      continue;
    }
    const id = await entryId(rank);
    writes.push(
      db
        .prepare(
          "INSERT INTO mmr_entries (id, player, mmr, tier, division, author, recorded_at, source) VALUES (?, ?, ?, ?, ?, 'rank-source', ?, 'observer') ON CONFLICT(id) DO NOTHING",
        )
        .bind(id, rank.player, rank.mmr, rank.tier, rank.division, rank.observedAt),
      projectMmrRankWrite(db, { playerId: rank.playerId, id, author: 'rank-source', player: rank.player }),
    );
    changed++;
  }
  if (writes.length) await db.batch(writes);
  return { changed };
}
