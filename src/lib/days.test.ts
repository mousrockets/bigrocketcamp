import { expect, test } from 'vitest';
import { lastDayOf, parisDay, parisHour, parisMonth, sameParisDay, shiftDay, shiftMonth, weekStart } from './days';

test('an hour is the Paris hour, summer and winter', () => {
  expect(parisHour('2026-11-07T18:05:00Z')).toBe(19);
  expect(parisHour('2026-07-07T18:05:00Z')).toBe(20);
  expect(parisHour('2026-11-07T23:30:00Z')).toBe(0);
});

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

test('months move across years, and each ends on its own last day', () => {
  expect(shiftMonth('2026-11', -1)).toBe('2026-10');
  expect(shiftMonth('2027-01', -1)).toBe('2026-12');
  expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  expect(lastDayOf('2026-10')).toBe('2026-10-31');
  expect(lastDayOf('2028-02')).toBe('2028-02-29');
});
