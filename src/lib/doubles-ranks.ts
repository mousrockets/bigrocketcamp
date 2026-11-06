import type { Roster } from './club';
import type { Database } from './db';

export const doublesPlaylist = 11;
const roman = ['I', 'II', 'III', 'IV'];
const tiers = [
  'Non classé',
  ...['Bronze', 'Argent', 'Or', 'Platine', 'Diamant', 'Champion', 'Grand Champion'].flatMap((name) =>
    roman.slice(0, 3).map((numeral) => `${name} ${numeral}`),
  ),
  'Légende supersonique',
];

export function doublesRankLabel(rank: {
  tier: number;
  division: number | null;
  placementMatches: number | null;
}): string {
  if (rank.tier === 0 || (rank.placementMatches !== null && rank.placementMatches < 10)) {
    return rank.placementMatches !== null && rank.placementMatches < 10
      ? `Non classé · Placement ${rank.placementMatches}/10`
      : 'Non classé';
  }
  const name = tiers[rank.tier];
  return name ? name + (rank.division ? ` · Division ${roman[rank.division - 1]}` : '') : 'Classement non reçu';
}

interface StoredRank {
  player: string;
  mmr: number | null;
  tier: number | null;
  division: number | null;
  placement_matches: number | null;
  matches_played: number | null;
  fetched_at: string | null;
  last_attempt: string | null;
  status: string;
}

export interface PlayerDoublesRank {
  player: string;
  playlist: number;
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
  const stored = (
    await db
      .prepare(
        'SELECT player,mmr,tier,division,placement_matches,matches_played,fetched_at,last_attempt,status FROM player_ranks WHERE playlist=11',
      )
      .all<StoredRank>()
  ).results;
  return roster.map((player) => {
    const rank = stored.find((candidate) => candidate.player === player);
    if (!rank || rank.mmr === null) {
      return {
        player,
        playlist: doublesPlaylist,
        mmr: null,
        label: rank?.status === 'identity_conflict' ? 'Compte à vérifier' : 'Classement non reçu',
        tier: null,
        matchesPlayed: null,
        status: rank?.status || 'waiting',
        fetchedAt: null,
        lastAttempt: rank?.last_attempt || null,
      };
    }
    if (rank.tier === null) {
      return {
        player,
        playlist: doublesPlaylist,
        mmr: rank.mmr,
        label: 'Rang non renseigné',
        tier: null,
        matchesPlayed: rank.matches_played,
        status: rank.status,
        fetchedAt: rank.fetched_at,
        lastAttempt: rank.last_attempt,
      };
    }
    return {
      player,
      playlist: doublesPlaylist,
      mmr: rank.mmr,
      label: doublesRankLabel({ tier: rank.tier, division: rank.division, placementMatches: rank.placement_matches }),
      tier: rank.tier,
      matchesPlayed: rank.matches_played,
      status: rank.status,
      fetchedAt: rank.fetched_at,
      lastAttempt: rank.last_attempt,
    };
  });
}
