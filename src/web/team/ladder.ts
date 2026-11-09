import type { Board } from '../board';

// The ranks' ladder in 2v2, as the club reads it: each rank and the MMR from which it is won, divisions left out.

export interface RankStep {
  /** The rank's tier, as the rank source sends it and its icon is named: 1 for Bronze I, 22 for Supersonic Legend. */
  tier: number;
  name: string;
  /** The MMR from which the rank is won. */
  mmr: number;
}

// The club's figures, set on 2026-11-09. They move a little from one season to the next.
const steps: [name: string, mmr: number][] = [
  ['Bronze I', 0],
  ['Bronze II', 169],
  ['Bronze III', 229],
  ['Argent I', 292],
  ['Argent II', 353],
  ['Argent III', 413],
  ['Or I', 473],
  ['Or II', 533],
  ['Or III', 593],
  ['Platine I', 642],
  ['Platine II', 711],
  ['Platine III', 772],
  ['Diamant I', 835],
  ['Diamant II', 915],
  ['Diamant III', 995],
  ['Champion I', 1075],
  ['Champion II', 1195],
  ['Champion III', 1315],
  ['Grand Champion I', 1435],
  ['Grand Champion II', 1575],
  ['Grand Champion III', 1715],
  ['Supersonic Legend', 1861],
];

/** From Bronze I up to Supersonic Legend. */
export const rankLadder: readonly RankStep[] = steps.map(([name, mmr], index) => ({ tier: index + 1, name, mmr }));

export const rankStep = (tier: number): RankStep | undefined => rankLadder.find((step) => step.tier === tier);

export interface Climb {
  current: RankStep;
  /** Null at the top of the ladder. */
  next: RankStep | null;
  /** MMR still to win before the next rank; 0 once it is reached, before the game promotes the player. */
  left: number;
  /** How far between the rank's MMR and the next one's, 0 to 100. */
  percent: number;
}

/** Where a rating stands between its rank and the next one. */
export function climbOf(tier: number, mmr: number): Climb | null {
  const current = rankStep(tier);
  if (!current) return null;
  const next = rankStep(tier + 1) ?? null;
  if (!next) return { current, next, left: 0, percent: 100 };
  const share = (mmr - current.mmr) / (next.mmr - current.mmr);
  return {
    current,
    next,
    left: Math.max(0, next.mmr - mmr),
    percent: Math.round(Math.min(1, Math.max(0, share)) * 100),
  };
}

export interface SoloLine {
  player: string;
  me: boolean;
  /** Players level on MMR share a position. */
  position: number;
  step: RankStep;
  mmr: number;
}

type DoublesRank = Board['doublesRanks'][number];

/** A solo account's rating, while the rank source can still read it. */
export function soloReading(ranks: DoublesRank | undefined): { tier: number; mmr: number } | null {
  const solo = ranks?.solo;
  if (!solo || solo.status === 'not_found' || solo.status === 'needs_player_id') return null;
  return solo.tier && solo.mmr !== null ? { tier: solo.tier, mmr: solo.mmr } : null;
}

/** The club's solo accounts, highest MMR first; a member whose solo account was never read is left out. */
export function soloLines(
  doublesRanks: readonly DoublesRank[],
  roster: readonly string[],
  me: string | null,
): SoloLine[] {
  const read = roster.flatMap((player) => {
    const reading = soloReading(doublesRanks.find((ranks) => ranks.player === player));
    const step = reading && rankStep(reading.tier);
    return reading && step ? [{ player, me: player === me, step, mmr: reading.mmr }] : [];
  });
  return read
    .sort((a, b) => b.mmr - a.mmr || roster.indexOf(a.player) - roster.indexOf(b.player))
    .map((line) => ({ ...line, position: 1 + read.filter((other) => other.mmr > line.mmr).length }));
}
