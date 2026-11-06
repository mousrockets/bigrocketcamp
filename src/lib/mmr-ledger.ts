import type { Database, Statement } from './db';

export const publicCloseFreshMs = 15 * 60 * 1000;

export interface MmrEntry {
  sequence?: number;
  id?: string;
  player: string;
  mmr: number;
  tier?: number | null;
  division?: number | null;
  recorded_at: string;
  source?: string;
  source_at?: string | null;
  source_url?: string | null;
}

/** A public snapshot counts from when the profile was read; a manual entry from when it was saved. */
export const mmrObservedAt = (entry: Pick<MmrEntry, 'source' | 'source_at' | 'recorded_at'>): string =>
  entry.source === 'rlstats' ? (entry.source_at ?? '') : entry.recorded_at;

// One ordering for cards and monthly results, including equal timestamps and retries.
export function projectMmrRankWrite(
  db: Database,
  { playerId, id, author, player }: { playerId: string; id: string; author: string; player: string },
): Statement {
  const observed = "CASE WHEN source='rlstats' THEN source_at ELSE recorded_at END";
  return db
    .prepare(`INSERT INTO player_ranks (player,player_id,playlist,mmr,tier,division,placement_matches,fetched_at,last_attempt,status)
 SELECT player,?,11,mmr,tier,division,NULL,${observed},recorded_at,CASE WHEN source='rlstats' THEN 'public' ELSE 'manual' END
 FROM mmr_entries WHERE id=? AND author=? AND player=? AND id=(SELECT id FROM mmr_entries WHERE player=? ORDER BY ${observed} DESC,recorded_at DESC,rowid DESC LIMIT 1)
 ON CONFLICT(player) DO UPDATE SET player_id=excluded.player_id,playlist=11,mmr=excluded.mmr,tier=excluded.tier,division=excluded.division,placement_matches=NULL,fetched_at=excluded.fetched_at,last_attempt=excluded.last_attempt,status=excluded.status
 WHERE player_ranks.fetched_at IS NULL OR player_ranks.fetched_at<=excluded.fetched_at`)
    .bind(playerId, id, author, player, player);
}
