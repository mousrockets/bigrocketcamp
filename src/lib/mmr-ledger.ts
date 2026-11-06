import type { Database, Statement } from './db';

/** The duo account is the player slot's; the solo one, the account named by the profile's solo pseudo. */
export type MmrAccount = 'duo' | 'solo';

export interface MmrEntry {
  sequence?: number;
  /** Duo when absent. */
  account?: MmrAccount;
  id?: string;
  player: string;
  mmr: number;
  tier?: number | null;
  division?: number | null;
  recorded_at: string;
}

/** Shows an entry on the player's card when it is their latest one: one ordering for cards and monthly results. */
export function projectMmrRankWrite(
  db: Database,
  { playerId, id, author, player }: { playerId: string; id: string; author: string; player: string },
): Statement {
  return db
    .prepare(`INSERT INTO player_ranks (player,player_id,mmr,tier,division,fetched_at,last_attempt,status)
 SELECT player,?,mmr,tier,division,recorded_at,recorded_at,'ready'
 FROM mmr_entries WHERE id=? AND author=? AND player=? AND id=(SELECT id FROM mmr_entries WHERE player=? ORDER BY recorded_at DESC,rowid DESC LIMIT 1)
 ON CONFLICT(player) DO UPDATE SET player_id=excluded.player_id,mmr=excluded.mmr,tier=excluded.tier,division=excluded.division,fetched_at=excluded.fetched_at,last_attempt=excluded.last_attempt,status=excluded.status
 WHERE player_ranks.fetched_at IS NULL OR player_ranks.fetched_at<=excluded.fetched_at`)
    .bind(playerId, id, author, player, player);
}
