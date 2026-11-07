import { expect, test } from 'vitest';
import { parisDay, parisMonth, sameParisDay, shiftDay, weekStart } from './days';

test('a day is the Paris calendar day', () => {
  // 23:30 UTC on 7 November is already the 8th in Paris.
  expect(parisDay('2026-11-07T23:30:00Z')).toBe('2026-11-08');
  expect(parisMonth('2026-11-30T23:30:00Z')).toBe('2026-12');
  expect(sameParisDay('2026-11-07T22:30:00Z', '2026-11-07T23:30:00Z')).toBe(false);
});

test('days move across months and weeks start on Monday', () => {
  expect(shiftDay('2026-11-30', 1)).toBe('2026-12-01');
  expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  expect(weekStart('2026-11-08')).toBe('2026-11-02');
  expect(weekStart('2026-11-02')).toBe('2026-11-02');
});
