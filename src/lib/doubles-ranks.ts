import type { Roster } from './club';
import type { Database } from './db';
import { orm } from './orm';
import { playerRanks } from './schema';

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
}

export async function readDoublesRanks(db: Database, roster: Roster): Promise<PlayerDoublesRank[]> {
  const stored = await orm(db)
    .select({
      player: playerRanks.player,
      mmr: playerRanks.mmr,
      tier: playerRanks.tier,
      division: playerRanks.division,
      matchesPlayed: playerRanks.matchesPlayed,
      fetchedAt: playerRanks.fetchedAt,
      lastAttempt: playerRanks.lastAttempt,
      status: playerRanks.status,
    })
    .from(playerRanks);
  return roster.map((player) => {
    const rank = stored.find((candidate) => candidate.player === player);
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
      };
    }
    return {
      ...rank,
      label: rank.tier === null ? 'Rang non renseigné' : doublesRankLabel({ tier: rank.tier, division: rank.division }),
    };
  });
}
