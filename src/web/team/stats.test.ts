import { expect, test } from 'vitest';
import {
  currentStreak,
  debtOf,
  highestTier,
  latest,
  litSegments,
  rankRgb,
  shortRankLabel,
  splitRankLabel,
} from './stats';

test('a streak ends today, or yesterday while today is still open', () => {
  const days = new Set(['2026-11-04', '2026-11-05', '2026-11-06']);
  expect(currentStreak(days, '2026-11-06')).toBe(3);
  expect(currentStreak(days, '2026-11-07')).toBe(3);
  expect(currentStreak(days, '2026-11-08')).toBe(0);
  expect(currentStreak(new Set(), '2026-11-07')).toBe(0);
});

test('the debt counts what was paid up to what is owed', () => {
  expect(debtOf({ due: 175, done: 140 })).toEqual({ left: 35, paid: 140, owed: 175, percent: 80 });
  expect(debtOf({ due: 120, done: 150 })).toEqual({ left: 0, paid: 120, owed: 120, percent: 100 });
  // Nobody lost yet: nothing is owed, all is paid.
  expect(debtOf({ due: 0, done: 0 }).percent).toBe(100);
});

test('the gauge lights its segments in proportion', () => {
  expect(litSegments(80, 24)).toBe(19);
  expect(litSegments(0, 24)).toBe(0);
  expect(litSegments(100, 24)).toBe(24);
  expect(litSegments(130, 24)).toBe(24);
});

test('a rank label splits into the rank and its division', () => {
  expect(splitRankLabel('Champion III · Division II')).toEqual({ rank: 'Champion III', division: 'Division II' });
  expect(splitRankLabel('Non classé')).toEqual({ rank: 'Non classé', division: '' });
  expect(shortRankLabel('Champion III · Division II')).toBe('Champion III · Div. II');
});

test('a player takes the colour of their highest rank', () => {
  expect(highestTier(15, 19)).toBe(19);
  expect(highestTier(17, null)).toBe(17);
  expect(highestTier(null, undefined)).toBeNull();
  expect(rankRgb(19)).toBe('150,68,78');
  expect(rankRgb(16)).toBe('158,115,220');
  expect(rankRgb(13)).toBe('39,163,230');
  expect(rankRgb(null)).toBe(rankRgb(0));
});

test('the latest reading wins', () => {
  expect(latest('2026-11-07T10:00:00Z', null, '2026-11-07T11:00:00Z')).toBe('2026-11-07T11:00:00Z');
  expect(latest(null, undefined)).toBeNull();
});
