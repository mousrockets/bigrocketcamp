import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { anExercise } from '../test-utils';
import { hasRecap, monthRecap, recapMonths } from './recap';
import { octoberBoard, roster } from './recap-fixture';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-07T15:00:00Z'));
});
afterEach(() => vi.useRealTimers());

test('tells the club’s month: its matches, its pushups, who led and the streaks', () => {
  const recap = monthRecap(octoberBoard, roster, 'alice', '2026-10');
  expect(recap.active).toBe(true);
  expect(recap.club).toEqual({ matches: 5, wins: 3, losses: 2, pushups: 70 });
  expect(recap.mvp).toEqual({ players: ['alice'], value: 40 });
  // November's series does not pay October's debt.
  expect(recap.debt).toEqual({ players: ['bob'], value: 5 });
  expect(recap.winStreak).toEqual({ players: ['bob'], value: 2 });
  expect(recap.lossStreak).toEqual({ players: ['alice'], value: 2 });
});

test('finds the best climb of the monthly challenge, its ranks, and who paid', () => {
  const recap = monthRecap(octoberBoard, roster, 'alice', '2026-10');
  expect(recap.climb).toEqual({ players: ['alice'], value: 80, from: 18, to: 19 });
  expect(recap.verdict).toEqual({ status: 'final', payers: ['carol'] });
  expect(monthRecap(octoberBoard, roster, 'alice', '2026-09').climb).toBeNull();
});

test('counts the fun stats and the member’s own month', () => {
  const recap = monthRecap(octoberBoard, roster, 'alice', '2026-10');
  expect(recap.fun).toEqual({ demos: 3, crossbars: 1, overtimes: 1, forfeits: 1 });
  expect(recap.mine).toMatchObject({ pushups: 40, place: 1, matches: 3, wins: 1 });
  expect(monthRecap(octoberBoard, roster, 'carol', '2026-10').mine).toMatchObject({ pushups: 30, place: 2 });
});

test('a tie keeps every leader', () => {
  const tied = {
    ...octoberBoard,
    exercises: [
      ...octoberBoard.exercises,
      anExercise({ id: 'exercise-0000000004', player: 'bob', count: 40, day: '2026-10-09' }),
    ],
  };
  expect(monthRecap(tied, roster, 'alice', '2026-10').mvp).toEqual({ players: ['alice', 'bob'], value: 40 });
});

test('lists the months gone by with something to tell, newest first', () => {
  expect(recapMonths(octoberBoard, roster, '2026-11')).toEqual([{ month: '2026-10', matches: 5, pushups: 70 }]);
  expect(hasRecap(octoberBoard, roster, '2026-10')).toBe(true);
  expect(hasRecap(octoberBoard, roster, '2026-09')).toBe(false);
  expect(monthRecap(octoberBoard, roster, 'alice', '2026-09')).toMatchObject({ active: false, mine: null });
});
