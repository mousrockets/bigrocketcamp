import type { SeasonMmr } from '../../lib/contract';
import { currentSeason } from '../../lib/season';
import type { Board } from '../board';
import { ratingOnLadder } from '../team/ladder';

// The season's challenge, the club's most important: each player's solo account, their own level, its peak of the
// season against its peak all time before it. Levels differ, so the club compares these gaps, not the peaks.

/** A player's peak of a season against their peak all time before it: above 0, they beat it by that much. */
export interface PeakGap {
  /** The season's peak, and its rank's tier, for the icon. */
  peak: number;
  tier: number | null;
  /** The peak all time before the season, and the tier of its rank; null while unknown. */
  allTime: number | null;
  allTimeTier: number | null;
  /** The season's peak minus the peak all time before it; null while that one is unknown. */
  gap: number | null;
}

/**
 * A solo account's peak all time before a season: for the season under way, the best the account had when it began,
 * kept by the API; for a past one, the highest peak of the seasons before it that the app read.
 */
export function peakGapOf(board: Board, seasonMmr: readonly SeasonMmr[], name: string, season: number): PeakGap | null {
  const own = seasonMmr.filter((line) => line.player === name && line.account === 'solo');
  const line = own.find((candidate) => candidate.season === season);
  if (!line) return null;
  const kept = board.doublesRanks?.find((rank) => rank.player === name)?.solo?.seasonStartBest;
  const earlier = own
    .filter((other) => other.season < season)
    .reduce<SeasonMmr | null>((best, other) => (!best || other.peak.mmr > best.peak.mmr ? other : best), null);
  const before = season === currentSeason.number ? (kept ?? null) : (earlier?.peak ?? null);
  const peak = line.peak.mmr;
  return {
    peak,
    tier: line.peak.tier,
    allTime: before?.mmr ?? null,
    // A best set by hand has no rank of its own: the ladder gives the one it reaches.
    allTimeTier: before ? (before.tier ?? ratingOnLadder(before.mmr).tier) : null,
    gap: before ? peak - before.mmr : null,
  };
}

/** A player on the podium of peaks: their place, shared on a tie, and their gap. */
export interface Climber {
  /** Their player slot, which is their duo pseudo. */
  name: string;
  /** Their solo account's pseudo, once the rank source read it; their duo pseudo until then. */
  shown: string;
  me: boolean;
  gap: PeakGap & { gap: number };
  place: number;
}

/**
 * The players of the roster on the season's podium of solo peaks: the gap that beat its peak all time by the most
 * first, then those that came closest to it. Those whose gap is unknown (no peak read that season, or no peak all
 * time before it) come apart, by their solo pseudo.
 */
export function seasonPeaks(
  board: Board,
  seasonMmr: readonly SeasonMmr[],
  roster: readonly string[],
  me: string | null,
  season: number,
): { climbers: Climber[]; unknown: string[] } {
  const players = roster.map((name) => ({
    name,
    shown: board.doublesRanks?.find((rank) => rank.player === name)?.solo?.pseudo || name,
    me: name === me,
    gap: peakGapOf(board, seasonMmr, name, season),
  }));
  const known = players
    .filter((player): player is typeof player & { gap: Climber['gap'] } => player.gap?.gap != null)
    .sort((a, b) => b.gap.gap - a.gap.gap);
  return {
    climbers: known.map((player) => ({
      ...player,
      place: 1 + known.filter((other) => other.gap.gap > player.gap.gap).length,
    })),
    unknown: players.filter((player) => player.gap?.gap == null).map((player) => player.shown),
  };
}

/** The seasons the challenge can show, the newest first: the one under way, and every one a solo peak was read in. */
export const challengeSeasons = (seasonMmr: readonly SeasonMmr[], roster: readonly string[], current: number) =>
  [
    ...new Set([
      current,
      ...seasonMmr
        .filter((line) => line.account === 'solo' && roster.includes(line.player) && line.season <= current)
        .map((line) => line.season),
    ]),
  ].sort((a, b) => b - a);
