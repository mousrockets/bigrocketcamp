import { and, desc, eq, isNotNull, isNull, lt, lte, max, or, type SQLWrapper, sql } from 'drizzle-orm';
import { type Platform, readClubPlayers } from './club';
import { parisDay } from './days';
import type { Database } from './db';
import { projectMmrRankWrite } from './mmr-ledger';
import { excluded, type Orm, orm, rowid, statementOf } from './orm';
import { canonicalPlayerId } from './player-identities';
import {
  collectors,
  members,
  mmrEntries,
  playerIdentities,
  playerIdentityAliases,
  playerRanks,
  soloMmrEntries,
  soloRanks,
} from './schema';
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
  /** Placement matches played while the season's ten are not done; null once placed, or from an older source. */
  placements: number | null;
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
  const query = orm(db);
  const [players, identities, solo] = await Promise.all([
    readClubPlayers(db),
    query.select({ slot: playerIdentities.slot, playerId: playerIdentities.playerId }).from(playerIdentities),
    query
      .select({ player: members.duoPseudo, name: members.soloPseudo, playerId: members.soloPlayerId })
      .from(members)
      .where(and(isNotNull(members.duoPseudo), isNotNull(members.soloPseudo))) as Promise<
      { player: string; name: string; playerId: string | null }[]
    >,
  ]);
  const platformOf = new Map(players.map((player) => [player.slot, player.platform]));
  // The source answers in the format with account kinds as soon as one target has a kind: every target has one.
  const duo: DuoTarget[] = identities
    .filter((identity) => platformOf.has(identity.slot))
    .map((identity) => ({ player: identity.slot, kind: 'duo', playerId: identity.playerId }));
  const soloTargets: SoloTarget[] = players.flatMap((player) => {
    const account = solo.find((candidate) => candidate.player === player.slot);
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
const peakWrite = (query: Orm, table: typeof playerRanks | typeof soloRanks, rank: ObservedRank) =>
  query
    .update(table)
    .set({
      season: currentSeason.number,
      peakMmr: rank.mmr,
      peakTier: rank.tier,
      peakDivision: rank.division,
      peakAt: rank.observedAt,
    })
    .where(
      and(
        eq(table.player, rank.player),
        or(sql`${table.season} IS NOT ${currentSeason.number}`, isNull(table.peakMmr), lt(table.peakMmr, rank.mmr)),
      ),
    );

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

type Ledger = typeof mmrEntries | typeof soloMmrEntries;

const entryColumns = (ledger: Ledger) => ({
  mmr: ledger.mmr,
  tier: ledger.tier,
  division: ledger.division,
  recordedAt: ledger.recordedAt,
});

/** Ties on the reading time go to the entry written last. */
const newestFirst = (ledger: Ledger) => [desc(ledger.recordedAt), desc(rowid)];

interface Writes {
  writes: SQLWrapper[];
  changed: boolean;
}

async function duoWrites(query: Orm, rank: ObservedRank): Promise<Writes> {
  const latest =
    (await query
      .select(entryColumns(mmrEntries))
      .from(mmrEntries)
      .where(eq(mmrEntries.player, rank.player))
      .orderBy(...newestFirst(mmrEntries))
      .limit(1)
      .get()) ?? null;
  const writes: SQLWrapper[] = [];
  const changed = !repeats(latest, rank);
  if (changed) {
    const id = await entryId(rank);
    writes.push(
      query
        .insert(mmrEntries)
        .values({
          id,
          player: rank.player,
          mmr: rank.mmr,
          tier: rank.tier,
          division: rank.division,
          recordedAt: rank.observedAt,
        })
        .onConflictDoNothing({ target: mmrEntries.id }),
      projectMmrRankWrite({ playerId: rank.playerId, id, player: rank.player }),
    );
  } else {
    writes.push(
      query
        .update(playerRanks)
        .set({ fetchedAt: rank.observedAt, lastAttempt: rank.observedAt, status: 'ready' })
        .where(eq(playerRanks.player, rank.player)),
    );
  }
  if (rank.matches !== null) {
    writes.push(
      query.update(playerRanks).set({ matchesPlayed: rank.matches }).where(eq(playerRanks.player, rank.player)),
    );
  }
  writes.push(
    query.update(playerRanks).set({ placementMatches: rank.placements }).where(eq(playerRanks.player, rank.player)),
  );
  writes.push(peakWrite(query, playerRanks, rank));
  return { writes, changed };
}

/** Null when another member's profile already holds this solo account. */
async function soloWrites(query: Orm, rank: ObservedRank, target: SoloTarget): Promise<Writes | null> {
  const writes: SQLWrapper[] = [];
  if (target.playerId === null) {
    const holder = await query
      .select({ duoPseudo: members.duoPseudo })
      .from(members)
      .where(eq(members.soloPlayerId, rank.playerId))
      .get();
    if (holder) return null;
    writes.push(
      query
        .update(members)
        .set({ soloPlayerId: rank.playerId })
        .where(
          and(eq(members.duoPseudo, rank.player), eq(members.soloPseudo, target.name), isNull(members.soloPlayerId)),
        ),
    );
    // The member named this account in their profile: its matches count as theirs, like a game ID they confirmed.
    writes.push(
      query
        .insert(playerIdentityAliases)
        .select(
          query
            .select({
              playerId: sql<string>`${canonicalPlayerId(rank.playerId)}`.as('player_id'),
              slot: sql<string>`${members.duoPseudo}`.as('slot'),
              confirmedBy: members.id,
              confirmedAt: sql<string>`${new Date().toISOString()}`.as('confirmed_at'),
            })
            .from(members)
            .where(and(eq(members.duoPseudo, rank.player), eq(members.soloPlayerId, rank.playerId))),
        )
        .onConflictDoNothing({ target: playerIdentityAliases.playerId }),
    );
  }
  const latest =
    (await query
      .select({ ...entryColumns(soloMmrEntries), playerId: soloMmrEntries.playerId })
      .from(soloMmrEntries)
      .where(eq(soloMmrEntries.player, rank.player))
      .orderBy(...newestFirst(soloMmrEntries))
      .limit(1)
      .get()) ?? null;
  const changed = !repeats(latest, rank) || latest?.playerId !== rank.playerId;
  if (changed) {
    writes.push(
      query
        .insert(soloMmrEntries)
        .values({
          id: await entryId(rank),
          player: rank.player,
          playerId: rank.playerId,
          mmr: rank.mmr,
          tier: rank.tier,
          division: rank.division,
          recordedAt: rank.observedAt,
        })
        .onConflictDoNothing({ target: soloMmrEntries.id }),
    );
  }
  writes.push(
    query
      .insert(soloRanks)
      .values({
        player: rank.player,
        playerId: rank.playerId,
        mmr: rank.mmr,
        tier: rank.tier,
        division: rank.division,
        matchesPlayed: rank.matches,
        placementMatches: rank.placements,
        fetchedAt: rank.observedAt,
        status: 'ready',
      })
      .onConflictDoUpdate({
        target: soloRanks.player,
        set: {
          playerId: excluded(soloRanks.playerId),
          mmr: excluded(soloRanks.mmr),
          tier: excluded(soloRanks.tier),
          division: excluded(soloRanks.division),
          matchesPlayed: sql`coalesce(${excluded(soloRanks.matchesPlayed)}, ${soloRanks.matchesPlayed})`,
          placementMatches: excluded(soloRanks.placementMatches),
          fetchedAt: excluded(soloRanks.fetchedAt),
          status: 'ready',
        },
        // A reading older than the one held never overwrites it.
        setWhere: sql`${isNull(soloRanks.fetchedAt)} OR ${lte(soloRanks.fetchedAt, excluded(soloRanks.fetchedAt))}`,
      }),
    peakWrite(query, soloRanks, rank),
    query
      .update(soloRanks)
      .set({ bestMmr: rank.mmr, bestTier: rank.tier, bestDivision: rank.division })
      .where(
        and(
          eq(soloRanks.player, rank.player),
          eq(soloRanks.playerId, rank.playerId),
          or(isNull(soloRanks.bestMmr), lt(soloRanks.bestMmr, rank.mmr)),
        ),
      ),
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
  const query = orm(db);
  const writes: SQLWrapper[] = [];
  let changed = 0;
  let ignored = report.ignored;
  for (const rank of report.ranks) {
    const target = targets.find((candidate) => candidate.kind === 'solo' && candidate.player === rank.player);
    const written =
      rank.kind === 'duo'
        ? await duoWrites(query, rank)
        : target?.kind === 'solo'
          ? await soloWrites(query, rank, target)
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
      query
        .insert(soloRanks)
        .values({ player, status: reason })
        .onConflictDoUpdate({
          target: soloRanks.player,
          set: { status: excluded(soloRanks.status) },
          setWhere: sql`${soloRanks.status} IS NOT ${excluded(soloRanks.status)}`,
        }),
    );
  }
  // One D1 batch, one transaction; a plain one, as it carries a raw insert (projectMmrRankWrite).
  if (writes.length) await db.batch(writes.map((write) => statementOf(db, write)));
  return { changed, ignored };
}

/**
 * When the app last received a ranked 2v2 match: a source that asks often can read the ranks right after a
 * match instead of waiting for its next turn. One row per live source, so asking every minute costs little.
 */
/**
 * When the rank source should read soon: the last ranked 2v2 match received, or the last time a member named another
 * solo account, so that its rank shows a minute later instead of at the next hourly reading. The source reads a
 * minute after this time (it calls it `lastRankedMatchAt`).
 */
export async function readLastRankedMatch(db: Database): Promise<string | null> {
  const query = orm(db);
  const [match, account] = await Promise.all([
    query
      .select({ last: max(collectors.lastRankedAt) })
      .from(collectors)
      .get(),
    query
      .select({ last: max(members.soloChangedAt) })
      .from(members)
      .get(),
  ]);
  return latestOf(match?.last ?? null, account?.last ?? null);
}

const latestOf = (a: string | null, b: string | null) => (a === null ? b : b === null ? a : a > b ? a : b);

// A healthy source reads at least hourly; past two hours, it has stopped.
const staleAfter = 2 * 60 * 60 * 1000;

export interface RankSourceHealth {
  lastReadAt: string | null;
  stale: boolean;
}

/** Only the rank source marks a rank `ready`: its newest one tells when the source last reported. */
export async function readRankSourceHealth(db: Database, now: number = Date.now()): Promise<RankSourceHealth> {
  const row = await orm(db)
    .select({ last: max(playerRanks.fetchedAt) })
    .from(playerRanks)
    .where(eq(playerRanks.status, 'ready'))
    .get();
  const lastReadAt = row?.last ?? null;
  return { lastReadAt, stale: rankSourceStale(lastReadAt, now) };
}

export const rankSourceStale = (lastReadAt: string | null, now: number = Date.now()): boolean =>
  lastReadAt === null || now - Date.parse(lastReadAt) > staleAfter;
