import { type Platform, readClubPlayers } from './club';
import type { Database, Statement } from './db';
import { parisDay } from './domain';
import { projectMmrRankWrite } from './mmr-ledger';
import { currentSeason } from './season';

// A rank source is a separate service that reads the players' ranked 2v2 rating and posts it here.
// The app only stores what it receives: how the source reads the ranks is none of its business.
// Each player has a duo account, their player slot's game ID, and may have a solo account, named by the
// solo pseudo of their profile: the source finds its game ID, which the app then keeps and sends back.

export type RankKind = 'duo' | 'solo';

export interface DuoTarget {
  player: string;
  kind: 'duo';
  playerId: string;
}

export interface SoloTarget {
  player: string;
  kind: 'solo';
  /** PsyNet's prefix of the profile's platform: whether a pseudo missing on Epic is a typo or a console account. */
  platform?: string;
  name: string;
  /** Null until the source found the account. */
  playerId: string | null;
}

export type RankTarget = DuoTarget | SoloTarget;

export interface ObservedRank {
  player: string;
  kind: RankKind;
  playerId: string;
  mmr: number;
  tier: number | null;
  division: number | null;
  /** Ranked 2v2 matches played, when the source can read it. */
  matches: number | null;
  observedAt: string;
}

export const unresolvedReasons = ['needs_player_id', 'not_found', 'lookup_unavailable', 'read_failed'] as const;
export type UnresolvedReason = (typeof unresolvedReasons)[number];

/** A solo account the source could not read, and why. */
export interface UnresolvedSolo {
  player: string;
  reason: UnresolvedReason;
}

export interface RankReport {
  ranks: ObservedRank[];
  unresolved: UnresolvedSolo[];
  /** Solo readings dropped because the profile changed since the source read its targets. */
  ignored: number;
}

const psynetPlatforms: Record<Platform, string> = { pc: 'Epic', playstation: 'PS4', xbox: 'XboxOne', switch: 'Switch' };

// A solo account found from its pseudo is always an Epic one, console accounts linked to Epic included.
const epicPlayerId = /^Epic\|[0-9a-f]{32}\|0$/i;

const sameName = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();

/** Every account of the club's players to read: each duo account, and each solo account named in a profile. */
export async function readRankTargets(db: Database): Promise<RankTarget[]> {
  const [players, identities, solo] = await Promise.all([
    readClubPlayers(db),
    db.prepare('SELECT slot, player_id FROM player_identities').all<{ slot: string; player_id: string }>(),
    db
      .prepare(
        'SELECT duo_pseudo AS player, solo_pseudo AS name, solo_player_id AS playerId FROM members WHERE duo_pseudo IS NOT NULL AND solo_pseudo IS NOT NULL',
      )
      .all<{ player: string; name: string; playerId: string | null }>(),
  ]);
  const platformOf = new Map(players.map((player) => [player.slot, player.platform]));
  // The source answers in the format with account kinds as soon as one target has a kind: every target has one.
  const duo: DuoTarget[] = identities.results
    .filter((identity) => platformOf.has(identity.slot))
    .map((identity) => ({ player: identity.slot, kind: 'duo', playerId: identity.player_id }));
  const soloTargets: SoloTarget[] = players.flatMap((player) => {
    const account = solo.results.find((candidate) => candidate.player === player.slot);
    if (!account) return [];
    const platform = player.platform ? psynetPlatforms[player.platform] : undefined;
    return [
      {
        player: player.slot,
        kind: 'solo',
        ...(platform ? { platform } : {}),
        name: account.name,
        playerId: account.playerId,
      },
    ];
  });
  return [...duo, ...soloTargets];
}

/** A report whose shape the API checked: readings and unread accounts, before matching them to the targets. */
export interface ShapedReport {
  ranks: (ObservedRank & { name?: string | null | undefined })[];
  unresolved: { player: string; name: string; reason: UnresolvedReason }[];
  /** Solo readings and unread accounts whose shape was wrong. */
  ignored: number;
}

/**
 * A solo reading counts when it reads the account the profile names now: the ID the app sent, or else an Epic
 * ID found from the profile's current pseudo. Anything else waits for the next reading.
 */
function soloTargetOf(rank: ShapedReport['ranks'][number], targets: RankTarget[]): SoloTarget | null {
  const target = targets.find(
    (candidate): candidate is SoloTarget => candidate.kind === 'solo' && candidate.player === rank.player,
  );
  if (!target) return null;
  const known = target.playerId
    ? rank.playerId === target.playerId
    : sameName(rank.name, target.name) && epicPlayerId.test(rank.playerId);
  return known ? target : null;
}

/**
 * Matches the report to the targets. A duo reading of an unknown account refuses everything, as it always did.
 * A solo reading or account the profile no longer names is dropped, so a solo account never stops the duo ranks.
 */
export function targetRanks(report: ShapedReport, targets: RankTarget[]): RankReport {
  const matched: RankReport = { ranks: [], unresolved: [], ignored: report.ignored };
  for (const reading of report.ranks) {
    const { name: _name, ...rank } = reading;
    if (rank.kind === 'duo') {
      if (
        !targets.some(
          (target) => target.kind === 'duo' && target.player === rank.player && target.playerId === rank.playerId,
        )
      ) {
        throw new Error('Relevé de rangs invalide.');
      }
      matched.ranks.push(rank);
    } else if (soloTargetOf(reading, targets)) {
      matched.ranks.push(rank);
    } else {
      matched.ignored++;
    }
  }
  for (const { player, name, reason } of report.unresolved) {
    const target = targets.find((candidate) => candidate.kind === 'solo' && candidate.player === player);
    if (target?.kind === 'solo' && sameName(name, target.name)) matched.unresolved.push({ player, reason });
    else matched.ignored++;
  }
  return matched;
}

async function entryId(rank: ObservedRank): Promise<string> {
  const key = `${rank.kind === 'solo' ? 'solo|' : ''}${rank.player}|${rank.observedAt}|${rank.mmr}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return `observer-${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 40)}`;
}

/**
 * The season peak is the highest rating read this season, with the rank it came with: the game gives none.
 * The first reading of a new season starts it over.
 */
const peakWrite = (db: Database, table: 'player_ranks' | 'solo_ranks', rank: ObservedRank) =>
  db
    .prepare(
      `UPDATE ${table} SET season = ?1, peak_mmr = ?2, peak_tier = ?3, peak_division = ?4, peak_at = ?5
        WHERE player = ?6 AND (season IS NOT ?1 OR peak_mmr IS NULL OR ?2 > peak_mmr)`,
    )
    .bind(currentSeason.number, rank.mmr, rank.tier, rank.division, rank.observedAt, rank.player);

interface LatestEntry {
  mmr: number;
  tier: number | null;
  division: number | null;
  recordedAt: string;
}

/**
 * Whether the reading only repeats the latest entry. A rating unchanged since an earlier day still gets an
 * entry with its first reading of the day: the monthly challenge needs one from the month's last day.
 */
const repeats = (latest: LatestEntry | null, rank: ObservedRank) =>
  latest !== null &&
  latest.mmr === rank.mmr &&
  latest.tier === rank.tier &&
  latest.division === rank.division &&
  parisDay(new Date(latest.recordedAt)) === parisDay(new Date(rank.observedAt));

async function duoWrites(db: Database, rank: ObservedRank): Promise<{ writes: Statement[]; changed: boolean }> {
  const latest = await db
    .prepare(
      'SELECT mmr, tier, division, recorded_at AS recordedAt FROM mmr_entries WHERE player = ? ORDER BY recorded_at DESC, rowid DESC LIMIT 1',
    )
    .bind(rank.player)
    .first<LatestEntry>();
  const writes: Statement[] = [];
  const changed = !repeats(latest, rank);
  if (changed) {
    const id = await entryId(rank);
    writes.push(
      db
        .prepare(
          'INSERT INTO mmr_entries (id, player, mmr, tier, division, recorded_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
        )
        .bind(id, rank.player, rank.mmr, rank.tier, rank.division, rank.observedAt),
      projectMmrRankWrite(db, { playerId: rank.playerId, id, player: rank.player }),
    );
  } else {
    writes.push(
      db
        .prepare("UPDATE player_ranks SET fetched_at = ?, last_attempt = ?, status = 'ready' WHERE player = ?")
        .bind(rank.observedAt, rank.observedAt, rank.player),
    );
  }
  if (rank.matches !== null) {
    writes.push(
      db.prepare('UPDATE player_ranks SET matches_played = ? WHERE player = ?').bind(rank.matches, rank.player),
    );
  }
  writes.push(peakWrite(db, 'player_ranks', rank));
  return { writes, changed };
}

/** Null when another member's profile already holds this solo account. */
async function soloWrites(
  db: Database,
  rank: ObservedRank,
  target: SoloTarget,
): Promise<{ writes: Statement[]; changed: boolean } | null> {
  const writes: Statement[] = [];
  if (target.playerId === null) {
    const holder = await db
      .prepare('SELECT duo_pseudo FROM members WHERE solo_player_id = ?')
      .bind(rank.playerId)
      .first<{ duo_pseudo: string | null }>();
    if (holder) return null;
    writes.push(
      db
        .prepare(
          'UPDATE members SET solo_player_id = ? WHERE duo_pseudo = ? AND solo_pseudo = ? AND solo_player_id IS NULL',
        )
        .bind(rank.playerId, rank.player, target.name),
    );
  }
  const latest = await db
    .prepare(
      'SELECT mmr, tier, division, recorded_at AS recordedAt, player_id AS playerId FROM solo_mmr_entries WHERE player = ? ORDER BY recorded_at DESC, rowid DESC LIMIT 1',
    )
    .bind(rank.player)
    .first<LatestEntry & { playerId: string }>();
  const changed = !repeats(latest, rank) || latest?.playerId !== rank.playerId;
  if (changed) {
    writes.push(
      db
        .prepare(
          'INSERT INTO solo_mmr_entries (id, player, player_id, mmr, tier, division, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
        )
        .bind(await entryId(rank), rank.player, rank.playerId, rank.mmr, rank.tier, rank.division, rank.observedAt),
    );
  }
  writes.push(
    db
      .prepare(
        `INSERT INTO solo_ranks (player, player_id, mmr, tier, division, matches_played, fetched_at, status)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'ready')
          ON CONFLICT(player) DO UPDATE SET player_id = excluded.player_id, mmr = excluded.mmr, tier = excluded.tier,
            division = excluded.division, matches_played = COALESCE(excluded.matches_played, solo_ranks.matches_played),
            fetched_at = excluded.fetched_at, status = 'ready'
          WHERE solo_ranks.fetched_at IS NULL OR solo_ranks.fetched_at <= excluded.fetched_at`,
      )
      .bind(rank.player, rank.playerId, rank.mmr, rank.tier, rank.division, rank.matches, rank.observedAt),
    peakWrite(db, 'solo_ranks', rank),
  );
  return { writes, changed };
}

/**
 * Keeps a new rating entry when the rating changed, or with the first reading of the day, so the history stays
 * short (a month's ranking reads all of the month), and marks the rank as freshly read either way.
 */
export async function recordObservedRanks(
  db: Database,
  report: RankReport,
  targets: RankTarget[],
): Promise<{ changed: number; ignored: number }> {
  const writes: Statement[] = [];
  let changed = 0;
  let ignored = report.ignored;
  for (const rank of report.ranks) {
    const target = targets.find((candidate) => candidate.kind === 'solo' && candidate.player === rank.player);
    const written =
      rank.kind === 'duo'
        ? await duoWrites(db, rank)
        : target?.kind === 'solo'
          ? await soloWrites(db, rank, target)
          : null;
    if (!written) {
      ignored++;
      continue;
    }
    writes.push(...written.writes);
    if (written.changed) changed++;
  }
  for (const { player, reason } of report.unresolved) {
    // An account read before keeps its last known rank; only its status says the reading failed.
    writes.push(
      db
        .prepare(
          'INSERT INTO solo_ranks (player, status) VALUES (?, ?) ON CONFLICT(player) DO UPDATE SET status = excluded.status WHERE solo_ranks.status IS NOT excluded.status',
        )
        .bind(player, reason),
    );
  }
  if (writes.length) await db.batch(writes);
  return { changed, ignored };
}

// A healthy source reads at least hourly; past two hours, it has stopped.
const staleAfter = 2 * 60 * 60 * 1000;

export interface RankSourceHealth {
  lastReadAt: string | null;
  stale: boolean;
}

/** Only the rank source marks a rank `ready`: its newest one tells when the source last reported. */
export async function readRankSourceHealth(db: Database, now: number = Date.now()): Promise<RankSourceHealth> {
  const row = await db
    .prepare("SELECT MAX(fetched_at) AS last FROM player_ranks WHERE status = 'ready'")
    .first<{ last: string | null }>();
  const lastReadAt = row?.last ?? null;
  return { lastReadAt, stale: rankSourceStale(lastReadAt, now) };
}

export const rankSourceStale = (lastReadAt: string | null, now: number = Date.now()): boolean =>
  lastReadAt === null || now - Date.parse(lastReadAt) > staleAfter;
