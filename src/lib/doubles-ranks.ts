import { and, isNotNull } from 'drizzle-orm';
import type { Roster } from './club';
import type { Database } from './db';
import { orm } from './orm';
import { members, playerRanks, soloRanks } from './schema';
import { currentSeason } from './season';

const roman = ['I', 'II', 'III', 'IV'];
const tiers = [
  'Non classé',
  ...['Bronze', 'Argent', 'Or', 'Platine', 'Diamant', 'Champion', 'Grand Champion'].flatMap((name) =>
    roman.slice(0, 3).map((numeral) => `${name} ${numeral}`),
  ),
  'Légende supersonique',
];

/** The rank's official name; the rank source reads no placement matches, so an unranked player is "Non classé". */
export function doublesRankLabel(rank: { tier: number; division: number | null }): string {
  if (rank.tier === 0) return 'Non classé';
  const name = tiers[rank.tier];
  return name ? name + (rank.division ? ` · Division ${roman[rank.division - 1]}` : '') : 'Classement non reçu';
}

/** The season's highest rating the rank source read, with the rank it came with. */
export interface SeasonPeak {
  mmr: number;
  label: string;
  tier: number | null;
}

/** Why a solo account shows no fresh rank: `ready` when it was read, else what the player can do about it. */
export type SoloRankStatus =
  | 'waiting'
  | 'ready'
  | 'not_found'
  | 'needs_player_id'
  | 'lookup_unavailable'
  | 'read_failed';

export interface PlayerSoloRank {
  mmr: number | null;
  label: string;
  tier: number | null;
  matchesPlayed: number | null;
  status: SoloRankStatus;
  fetchedAt: string | null;
  peak: SeasonPeak | null;
}

export interface PlayerDoublesRank {
  player: string;
  mmr: number | null;
  label: string;
  /** Shown as the rank icon; null while no rank was read. */
  tier: number | null;
  matchesPlayed: number | null;
  status: string;
  fetchedAt: string | null;
  lastAttempt: string | null;
  peak: SeasonPeak | null;
  /** Null when the player named no solo account in their profile. */
  solo: PlayerSoloRank | null;
}

interface StoredPeak {
  season: number | null;
  peakMmr: number | null;
  peakTier: number | null;
  peakDivision: number | null;
}

const rankLabel = (tier: number | null, division: number | null) =>
  tier === null ? 'Rang non renseigné' : doublesRankLabel({ tier, division });

/** Only this season's peak: an older one waits for the first reading of the season to start over. */
const peakOf = (rank: StoredPeak | undefined): SeasonPeak | null =>
  rank && rank.season === currentSeason.number && rank.peakMmr !== null
    ? { mmr: rank.peakMmr, label: rankLabel(rank.peakTier, rank.peakDivision), tier: rank.peakTier }
    : null;

const peakColumns = (table: typeof playerRanks | typeof soloRanks) => ({
  season: table.season,
  peakMmr: table.peakMmr,
  peakTier: table.peakTier,
  peakDivision: table.peakDivision,
});

const soloStatuses: readonly SoloRankStatus[] = [
  'ready',
  'not_found',
  'needs_player_id',
  'lookup_unavailable',
  'read_failed',
];

async function readSoloRanks(db: Database): Promise<Map<string, PlayerSoloRank>> {
  const query = orm(db);
  const [accounts, stored] = await Promise.all([
    query
      .select({ player: members.duoPseudo })
      .from(members)
      .where(and(isNotNull(members.duoPseudo), isNotNull(members.soloPseudo))),
    query
      .select({
        player: soloRanks.player,
        mmr: soloRanks.mmr,
        tier: soloRanks.tier,
        division: soloRanks.division,
        matchesPlayed: soloRanks.matchesPlayed,
        fetchedAt: soloRanks.fetchedAt,
        status: soloRanks.status,
        ...peakColumns(soloRanks),
      })
      .from(soloRanks),
  ]);
  return new Map(
    accounts.map(({ player }) => {
      const rank = stored.find((candidate) => candidate.player === player);
      const status = soloStatuses.find((known) => known === rank?.status) ?? 'waiting';
      return [
        player ?? '',
        {
          mmr: rank?.mmr ?? null,
          label: rank?.mmr == null ? 'Compte solo non relevé' : rankLabel(rank.tier, rank.division),
          tier: rank?.mmr == null ? null : rank.tier,
          matchesPlayed: rank?.matchesPlayed ?? null,
          status,
          fetchedAt: rank?.fetchedAt ?? null,
          peak: peakOf(rank),
        },
      ];
    }),
  );
}

export async function readDoublesRanks(db: Database, roster: Roster): Promise<PlayerDoublesRank[]> {
  const [stored, solo] = await Promise.all([
    orm(db)
      .select({
        player: playerRanks.player,
        mmr: playerRanks.mmr,
        tier: playerRanks.tier,
        division: playerRanks.division,
        matchesPlayed: playerRanks.matchesPlayed,
        fetchedAt: playerRanks.fetchedAt,
        lastAttempt: playerRanks.lastAttempt,
        status: playerRanks.status,
        ...peakColumns(playerRanks),
      })
      .from(playerRanks),
    readSoloRanks(db),
  ]);
  return roster.map((player) => {
    const rank = stored.find((candidate) => candidate.player === player);
    const extra = { peak: peakOf(rank), solo: solo.get(player) ?? null };
    if (!rank || rank.mmr === null) {
      return {
        player,
        mmr: null,
        label: rank?.status === 'identity_conflict' ? 'Compte à vérifier' : 'Classement non reçu',
        tier: null,
        matchesPlayed: null,
        status: rank?.status || 'waiting',
        fetchedAt: null,
        lastAttempt: rank?.lastAttempt || null,
        ...extra,
      };
    }
    return {
      player,
      mmr: rank.mmr,
      label: rankLabel(rank.tier, rank.division),
      tier: rank.tier,
      matchesPlayed: rank.matchesPlayed,
      status: rank.status,
      fetchedAt: rank.fetchedAt,
      lastAttempt: rank.lastAttempt,
      ...extra,
    };
  });
}
