import { roster } from './club';
import type { Database } from './db';
import { playerKey } from './reconcile';

export const doublesPlaylist = 11;
const roman = ['I', 'II', 'III', 'IV'];
const tiers = [
  'Non classé',
  ...['Bronze', 'Argent', 'Or', 'Platine', 'Diamant', 'Champion', 'Grand Champion'].flatMap((name) =>
    roman.slice(0, 3).map((numeral) => `${name} ${numeral}`),
  ),
  'Légende supersonique',
];
export const doublesRankOptions = tiers.map((label, tier) => ({ label, tier }));

const counter = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export interface DoublesRank {
  playlist: number;
  mmr: number | null;
  tier: number;
  division: number | null;
  placementMatches: number | null;
}

export function normalizeDoublesSkill(response: unknown): DoublesRank {
  const skillsList = (response as { Skills?: unknown } | null)?.Skills;
  if (!Array.isArray(skillsList)) throw new Error('Classement 2v2 non reçu.');
  const skills = skillsList.filter((skill) => skill?.Playlist === doublesPlaylist);
  if (skills.length !== 1) throw new Error('Classement 2v2 non reçu.');
  const skill = skills[0];
  if (!Number.isSafeInteger(skill.Tier) || skill.Tier < 0 || skill.Tier >= tiers.length)
    throw new Error('Rang 2v2 invalide.');
  const placementMatches: number | null = skill.PlacementMatchesPlayed == null ? null : skill.PlacementMatchesPlayed;
  if (placementMatches !== null && (!counter(placementMatches) || placementMatches > 10))
    throw new Error('Placement 2v2 invalide.');
  const ranked = skill.Tier > 0 && (placementMatches === null || placementMatches >= 10);
  if (
    ranked &&
    skill.Tier !== 22 &&
    (!Number.isSafeInteger(skill.Division) || skill.Division < 0 || skill.Division > 3)
  ) {
    throw new Error('Division 2v2 invalide.');
  }
  // PsyNet returns TrueSkill Mu. Display MMR = Mu * 20 + 100 (rlru MatchSkills).
  // Its raw MMR field is also on the internal scale; never display it as game MMR.
  let mmr: number | null = null;
  if (skill.Mu != null) {
    if (typeof skill.Mu !== 'number' || !Number.isFinite(skill.Mu) || Math.abs(skill.Mu) > 10000)
      throw new Error('MMR 2v2 invalide.');
    mmr = Math.round(skill.Mu * 20 + 100);
  } else if (ranked) throw new Error('MMR 2v2 non reçu.');
  return {
    playlist: doublesPlaylist,
    mmr,
    tier: skill.Tier,
    division: ranked && skill.Tier !== 22 ? skill.Division + 1 : null,
    placementMatches,
  };
}

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

export function rankTargets(
  rows: { name: string; kind: string; player_id: string; source_difference?: string | null }[],
  accounts: { slot: string; account_id: string; owner?: string }[],
  _owner?: string,
) {
  return roster.map((player) => {
    const linked = accounts.find((account) => account.slot === player);
    if (linked) return { player, playerId: `Epic|${linked.account_id}|0` };
    if (rows.some((row) => row.name === player && row.source_difference === 'identity'))
      return { player, playerId: null, conflict: true };
    const ids = [
      ...new Set(
        rows
          .filter((row) => row.name === player && row.kind === 'match')
          .map((row) => playerKey(row.player_id))
          .filter((id) => /^[A-Za-z0-9]+\|[^|]+(?:\|0)?$/.test(id)),
      ),
    ];
    return { player, playerId: ids.length === 1 ? ids[0] : null, conflict: ids.length > 1 };
  });
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

export async function readDoublesRanks(db: Database): Promise<PlayerDoublesRank[]> {
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
