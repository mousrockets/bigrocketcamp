import { expect, test } from 'vitest';
import type { SeasonMmr } from '../../lib/contract';
import { aRank, aSoloRank, boardWith } from '../test-utils';
import { challengeSeasons, peakGapOf, seasonPeaks } from './season-peaks';

// The season's challenge: each solo account's peak of the season against its peak all time before it. S24 is under way.

const peak = (mmr: number, tier: number) => ({ mmr, label: 'Champion I · Division II', tier });

const seasons: SeasonMmr[] = [
  { player: 'alice', account: 'solo', season: 24, first: 1000, last: 980, peak: peak(1040, 15) },
  { player: 'alice', account: 'solo', season: 23, first: 1000, last: 1090, peak: peak(1120, 15) },
  { player: 'alice', account: 'solo', season: 22, first: 900, last: 950, peak: peak(1000, 14) },
  // A duo rating takes no part in the challenge.
  { player: 'alice', account: 'duo', season: 24, first: 1100, last: 1180, peak: peak(1250, 16) },
  { player: 'bob', account: 'solo', season: 24, first: 1300, last: 1290, peak: peak(1330, 17) },
  { player: 'charlie', account: 'solo', season: 24, first: 900, last: 950, peak: peak(1000, 12) },
];

const board = boardWith({
  doublesRanks: [
    // Her solo best before the season, set by hand: no rank of its own.
    aRank({
      player: 'alice',
      solo: aSoloRank({ pseudo: 'alice-en-solo', seasonStartBest: { mmr: 1100, label: '', tier: null } }),
    }),
    aRank({ player: 'bob' }),
    aRank({
      player: 'charlie',
      solo: aSoloRank({ pseudo: 'charlie-solo', seasonStartBest: { mmr: 1040, label: '', tier: null } }),
    }),
  ],
});

test('measures each solo account’s peak of the season against its peak all time before the season', () => {
  const gap = (name: string, season: number) => {
    const found = peakGapOf(board, seasons, name, season);
    return found && [found.peak, found.allTime, found.gap];
  };
  // Alice's solo stayed 60 under its best before the season (1 100).
  expect(gap('alice', 24)).toEqual([1040, 1100, -60]);
  // Bob's solo was read this season, but its best before it is unknown.
  expect(gap('bob', 24)).toEqual([1330, null, null]);
  // A past season measures against the seasons before it the app read: 1 000 in season 22.
  expect(gap('alice', 23)).toEqual([1120, 1000, 120]);
  expect(gap('alice', 22)).toEqual([1000, null, null]);
  // A best set by hand takes the colour of the rank it reaches on the ladder.
  expect(peakGapOf(board, seasons, 'alice', 24)?.allTimeTier).toBeGreaterThan(0);
});

test('stands the solo accounts that beat their peak all time by the most first, a tie sharing its place, the unknown apart', () => {
  const { climbers, unknown } = seasonPeaks(board, seasons, ['alice', 'bob', 'charlie'], 'alice', 24);
  expect(climbers.map((climber) => [climber.shown, climber.gap.gap, climber.place, climber.me])).toEqual([
    ['charlie-solo', -40, 1, false],
    ['alice-en-solo', -60, 2, true],
  ]);
  // Without a solo account read, the player goes by their duo pseudo.
  expect(unknown).toEqual(['bob']);
});

test('offers the season under way, and every season a solo peak was read in, the newest first', () => {
  expect(challengeSeasons(seasons, ['alice', 'bob'], 24)).toEqual([24, 23, 22]);
  expect(challengeSeasons([], ['alice'], 24)).toEqual([24]);
});
