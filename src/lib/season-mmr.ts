import type { Roster } from './club';
import type { SeasonMmr } from './contract';
import type { Database } from './db';
import { doublesRankLabel } from './doubles-ranks';
import type { MmrAccount } from './mmr-ledger';
import { seasonStarts } from './season';

// Each account's MMR over each season, from the rank source's history: its first and last reading of the season,
// and its highest one with the rank it came with. The Stats page compares the players on it, a past season too.

interface Row {
  account: MmrAccount;
  player: string;
  season: number;
  first: number;
  last: number;
  mmr: number;
  tier: number | null;
  division: number | null;
}

const ledgers = [
  ['duo', 'mmr_entries'],
  ['solo', 'solo_mmr_entries'],
] as const;

/** The season of a reading, from when it was read (stored as toISOString writes it): the newest season it follows. */
const seasonCase = `CASE ${[...seasonStarts]
  .reverse()
  .map(({ number, start }) => `WHEN recorded_at >= '${new Date(start).toISOString()}' THEN ${number}`)
  .join(' ')} END`;

/**
 * Raw SQL: window functions (first and last reading, highest one) over json_each, which Drizzle cannot express. One
 * pass over each player's readings, through the (player, recorded_at) index. A player who changed solo account
 * during a season keeps one line for it: the club compares players, not accounts.
 */
const query = ledgers
  .map(
    ([account, table]) => `SELECT '${account}' AS account, player, season, first, last, mmr, tier, division FROM (
      SELECT player, season, mmr, tier, division,
        first_value(mmr) OVER read AS first,
        last_value(mmr) OVER (read ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS last,
        row_number() OVER (PARTITION BY player, season ORDER BY mmr DESC, recorded_at, id) AS place
      FROM (
        SELECT player, mmr, tier, division, recorded_at, rowid AS id, ${seasonCase} AS season
        FROM ${table} WHERE player IN (SELECT value FROM json_each(?1))
      )
      WHERE season IS NOT NULL
      WINDOW read AS (PARTITION BY player, season ORDER BY recorded_at, id)
    ) WHERE place = 1`,
  )
  .join(' UNION ALL ');

export async function readSeasonMmr(db: Database, roster: Roster): Promise<SeasonMmr[]> {
  const { results } = await db.prepare(query).bind(JSON.stringify(roster)).all<Row>();
  return results
    .map(({ account, player, season, first, last, mmr, tier, division }) => ({
      player,
      account,
      season,
      first,
      last,
      peak: {
        mmr,
        label: tier === null ? 'Rang non renseigné' : doublesRankLabel({ tier, division }),
        tier,
      },
    }))
    .sort((a, b) => b.season - a.season || a.player.localeCompare(b.player) || a.account.localeCompare(b.account));
}
