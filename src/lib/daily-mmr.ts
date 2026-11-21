import type { Roster } from './club';
import { parisDay } from './days';
import type { Database } from './db';
import type { MmrAccount } from './mmr-ledger';
import { midnightParis } from './monthly-mmr';

// What each account's MMR gained or lost on the last day the rank source read it: its last reading of that day
// minus its last reading before it. Matchs shows it in the recap of the last session. The board reads it on every
// change, so it costs a few indexed lookups per player, whatever the history.

export interface DailyMmr {
  player: string;
  /** "2026-11-07", a Paris day. */
  day: string;
  /** Each account's change that day; null for an account not read that day, or never before. */
  duo: number | null;
  solo: number | null;
}

interface Reading {
  account: MmrAccount;
  player: string;
  player_id: string | null;
  mmr: number;
  recorded_at: string;
}

// Only a solo reading names its account: a player may change their solo account, never their duo one.
const ledgers = [
  ['duo', 'mmr_entries', false],
  ['solo', 'solo_mmr_entries', true],
] as const;

/** The change of each account on the day of its latest reading, from the last reading before that day. */
export function dailyMmrChanges(latest: readonly Reading[], before: readonly (Reading | null)[]): DailyMmr[] {
  const changes = new Map<string, DailyMmr>();
  latest.forEach((closing, index) => {
    const previous = before[index];
    // Another solo account than the one before: its rating is not a change.
    if (!previous || previous.player_id !== closing.player_id) return;
    const day = parisDay(closing.recorded_at);
    const key = `${closing.player}\u0000${day}`;
    const change = changes.get(key) ?? { player: closing.player, day, duo: null, solo: null };
    change[closing.account] = closing.mmr - previous.mmr;
    changes.set(key, change);
  });
  return [...changes.values()].sort((a, b) => a.day.localeCompare(b.day) || a.player.localeCompare(b.player));
}

/** The MMR change of each player's accounts on the last day each was read. */
export async function readDailyMmr(db: Database, roster: Roster): Promise<DailyMmr[]> {
  // Raw: one indexed lookup per player, driven by json_each, which Drizzle cannot select from.
  const { results: latest } = await db
    .prepare(
      ledgers
        .map(
          ([account, table, named]) =>
            `SELECT '${account}' AS account,entry.player,${named ? 'entry.player_id' : 'NULL'} AS player_id,entry.mmr,entry.recorded_at
            FROM json_each(?1) AS slot
            JOIN ${table} AS entry ON entry.rowid = (
              SELECT rowid FROM ${table} WHERE player = slot.value ORDER BY recorded_at DESC, rowid DESC LIMIT 1
            )`,
        )
        .join(' UNION ALL '),
    )
    .bind(JSON.stringify(roster))
    .all<Reading>();
  if (!latest.length) return [];
  // The day's start in Paris, whatever the daylight saving time, only JavaScript knows: a second round.
  const before = await db.batch(
    latest.map((closing) => {
      const [, table, named] = ledgers.find(([account]) => account === closing.account) ?? ledgers[0];
      return db
        .prepare(
          `SELECT '${closing.account}' AS account,player,${named ? 'player_id' : 'NULL'} AS player_id,mmr,recorded_at
          FROM ${table} WHERE player = ?1 AND recorded_at < ?2 ORDER BY recorded_at DESC, rowid DESC LIMIT 1`,
        )
        .bind(closing.player, new Date(midnightParis(parisDay(closing.recorded_at))).toISOString());
    }),
  );
  return dailyMmrChanges(
    latest,
    before.map((answer) => (answer.results as Reading[] | undefined)?.[0] ?? null),
  );
}
