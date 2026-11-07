import { expect, test } from 'vitest';
import { countdown, payerOf, weeklyPodium } from './standings';

const roster = ['alice', 'bob', 'carol', 'dave'];
// Saturday 7 November 2026: the week started on Monday the 2nd.
const today = '2026-11-07';

test('the podium counts every exercise of the week in pushups, best first', () => {
  const podium = weeklyPodium(
    [
      { player: 'alice', type: 'pushups', count: 40, day: '2026-11-02' },
      { player: 'bob', type: 'plank', count: 240, day: '2026-11-05' },
      { player: 'bob', type: 'crunches', count: 20, day: '2026-11-07' },
      { player: 'carol', type: 'pushups', count: 10, day: '2026-11-06' },
      { player: 'dave', type: 'pushups', count: 5, day: '2026-11-03' },
      // Last week's Sunday does not count.
      { player: 'carol', type: 'pushups', count: 500, day: '2026-11-01' },
    ],
    roster,
    'bob',
    today,
  );
  expect(podium).toEqual([
    { name: 'bob', me: true, pushups: 70, rank: 1 },
    { name: 'alice', me: false, pushups: 40, rank: 2 },
    { name: 'carol', me: false, pushups: 10, rank: 3 },
  ]);
});

test('players level on pushups share a step, and nobody idle stands on the podium', () => {
  const podium = weeklyPodium(
    [
      { player: 'alice', count: 20, day: today },
      { player: 'bob', count: 20, day: today },
    ],
    roster,
    null,
    today,
  );
  expect(podium.map(({ name, rank }) => [name, rank])).toEqual([
    ['alice', 1],
    ['bob', 1],
  ]);
  expect(weeklyPodium([], roster, null, today)).toEqual([]);
});

test('the last one alone pays; a tie at the last place or a missing reading spares everyone', () => {
  expect(
    payerOf([
      { player: 'alice', mmr: 1500 },
      { player: 'bob', mmr: 1200 },
      { player: 'carol', mmr: 1100 },
    ]),
  ).toBe('carol');
  expect(
    payerOf([
      { player: 'alice', mmr: 1500 },
      { player: 'bob', mmr: 1100 },
      { player: 'carol', mmr: 1100 },
    ]),
  ).toBeNull();
  expect(
    payerOf([
      { player: 'alice', mmr: 1500 },
      { player: 'bob', mmr: null },
    ]),
  ).toBeNull();
});

test('the countdown gives whole days, hours and minutes, and stops at zero', () => {
  const cutoff = '2026-11-30T23:00:00.000Z';
  expect(countdown(cutoff, Date.parse('2026-11-07T15:15:30Z'))).toEqual({ days: 23, hours: 7, minutes: 44 });
  expect(countdown(cutoff, Date.parse('2026-12-01T00:00:00Z'))).toEqual({ days: 0, hours: 0, minutes: 0 });
});
