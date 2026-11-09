import { expect, test } from 'vitest';
import { aRank, aSoloRank } from '../test-utils';
import { climbOf, rankLadder, soloLines } from './ladder';

const solo = (tier: number | null, mmr: number | null, status: 'ready' | 'not_found' = 'ready') =>
  aSoloRank({ tier, mmr, status });

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

test('names each line after its solo account, with its best rating never below the current one', () => {
  const lines = soloLines(
    [
      aRank({ player: 'alice', solo: aSoloRank({ tier: 19, mmr: 1509, pseudo: 'alice_solo', best: 1560 }) }),
      aRank({ player: 'bob', solo: aSoloRank({ tier: 17, mmr: 1238, pseudo: 'bob_solo', best: 1200 }) }),
      aRank({ player: 'carol', solo: aSoloRank({ tier: 16, mmr: 1100 }) }),
    ],
    ['alice', 'bob', 'carol'],
    null,
  );
  expect(lines.map(({ name, best }) => ({ name, best }))).toEqual([
    { name: 'alice_solo', best: 1560 },
    { name: 'bob_solo', best: 1238 },
    { name: 'carol', best: null },
  ]);
});
