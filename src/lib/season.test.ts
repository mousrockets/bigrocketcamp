import { expect, test } from 'vitest';
import { currentSeason, seasonEndLabel, seasonTiming } from './season';

test('an unconfirmed end counts Paris calendar days, never an invented hour or an ended season', () => {
  expect(currentSeason.confirmedEndAt).toBe(null);
  expect(seasonTiming(Date.parse('2026-11-05T23:30:00Z')).days).toBe(33);
  expect(seasonEndLabel()).toBe('mercredi 9 décembre 2026');
  for (const instant of ['2026-12-08T23:00:00Z', '2026-12-10T12:00:00Z']) {
    const state = seasonTiming(Date.parse(instant));
    expect(state.days).toBe(0);
    expect(state.ended).toBe(false);
    expect(!state.exact && state.estimateReached).toBe(true);
  }
});

test('on a daylight saving change, French dates are counted, not 24-hour slices', () => {
  const season = { ...currentSeason, estimatedEndDay: '2026-10-26' };
  expect(seasonTiming(Date.parse('2026-10-24T22:30:00Z'), season).days).toBe(1);
});

test('a confirmed end converts winter and summer time and stops exactly without a negative counter', () => {
  const winter = { ...currentSeason, confirmedEndAt: '2026-12-09T15:00:00Z' };
  expect(seasonEndLabel(winter)).toMatch(/16:00/);
  expect(seasonEndLabel({ ...winter, confirmedEndAt: '2026-06-10T15:00:00Z' })).toMatch(/17:00/);
  const end = Date.parse(winter.confirmedEndAt);
  const beforeEnd = seasonTiming(end - 1, winter);
  expect(beforeEnd.exact && beforeEnd.seconds).toBe(1);
  expect(seasonTiming(end, winter).ended).toBe(true);
  expect(seasonTiming(end + 1000, winter).days).toBe(0);
});
