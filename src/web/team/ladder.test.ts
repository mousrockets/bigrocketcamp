import { expect, test } from 'vitest';
import { aRank } from '../test-utils';
import { climbOf, rankLadder, soloLines } from './ladder';

const solo = (tier: number | null, mmr: number | null, status: 'ready' | 'not_found' = 'ready') => ({
  mmr,
  label: '',
  tier,
  matchesPlayed: null,
  fetchedAt: null,
  peak: null,
  status,
});

test('climbs from Bronze I to Supersonic Legend, one tier and a higher MMR at a time', () => {
  expect(rankLadder).toHaveLength(22);
  expect(rankLadder[0]).toEqual({ tier: 1, name: 'Bronze I', mmr: 0 });
  expect(rankLadder.at(-1)).toEqual({ tier: 22, name: 'Supersonic Legend', mmr: 1861 });
  expect(rankLadder.every((step, index) => index === 0 || step.mmr > (rankLadder[index - 1]?.mmr ?? 0))).toBe(true);
});

test('says how much MMR is left before the next rank', () => {
  expect(climbOf(19, 1509)).toMatchObject({
    current: { name: 'Grand Champion I' },
    next: { name: 'Grand Champion II', mmr: 1575 },
    left: 66,
    percent: 53,
  });
});

test('keeps the gauge between empty and full when the game has not promoted or demoted yet', () => {
  expect(climbOf(19, 1420)).toMatchObject({ left: 155, percent: 0 });
  expect(climbOf(19, 1590)).toMatchObject({ left: 0, percent: 100 });
});

test('has nothing above Supersonic Legend', () => {
  expect(climbOf(22, 1900)).toMatchObject({ next: null, left: 0, percent: 100 });
  expect(climbOf(0, 100)).toBeNull();
});

test('ranks the club’s solo accounts by MMR, and leaves out those never read', () => {
  const lines = soloLines(
    [
      aRank({ player: 'alice', solo: solo(16, 1100) }),
      aRank({ player: 'bob', solo: solo(19, 1509) }),
      aRank({ player: 'carol', solo: solo(19, 1100) }),
      aRank({ player: 'dan', solo: solo(18, 1320, 'not_found') }),
      aRank({ player: 'erin', solo: null }),
    ],
    ['alice', 'bob', 'carol', 'dan', 'erin'],
    'alice',
  );
  expect(lines.map(({ player, me, position, mmr }) => ({ player, me, position, mmr }))).toEqual([
    { player: 'bob', me: false, position: 1, mmr: 1509 },
    { player: 'alice', me: true, position: 2, mmr: 1100 },
    { player: 'carol', me: false, position: 2, mmr: 1100 },
  ]);
  expect(lines[0]?.step.name).toBe('Grand Champion I');
});
