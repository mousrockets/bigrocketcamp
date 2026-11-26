import { expect, test } from 'vitest';
import { climbOf, rankLadder, ratingOnLadder } from './ladder';

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

test('gives a best rating set by hand the rank and division it wins: four even divisions per rank', () => {
  expect(ratingOnLadder(1435)).toEqual({ mmr: 1435, label: 'Grand Champion I · Division I', tier: 19 });
  expect(ratingOnLadder(1505)).toMatchObject({ label: 'Grand Champion I · Division III' });
  expect(ratingOnLadder(1560)).toMatchObject({ label: 'Grand Champion I · Division IV' });
  expect(ratingOnLadder(1135)).toMatchObject({ label: 'Champion I · Division III', tier: 16 });
  expect(ratingOnLadder(1900)).toEqual({ mmr: 1900, label: 'Supersonic Legend', tier: 22 });
});
