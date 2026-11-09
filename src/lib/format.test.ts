import { expect, test } from 'vitest';
import {
  count,
  formatAge,
  formatClock,
  formatDayDate,
  formatLongDay,
  formatMonth,
  formatNumber,
  formatShortDay,
  formatShortMonth,
  formatTime,
  formatWeek,
  formatWhen,
  plural,
} from './format';

test('numbers keep a full space between thousands', () => {
  expect(formatNumber(1509)).toBe('1 509');
  expect(formatNumber(35)).toBe('35');
  expect(formatNumber(2.5)).toBe('2,5');
});

test('words take an s from 2 on', () => {
  expect(plural(0, 'pompe')).toBe('pompe');
  expect(plural(1, 'jour')).toBe('jour');
  expect(count(35, 'pompe')).toBe('35 pompes');
  expect(count(2, 'abdo', 'abdos')).toBe('2 abdos');
});

test('times and dates are written in Paris time', () => {
  const now = Date.parse('2026-11-07T18:30:00Z');
  expect(formatTime('2026-11-07T18:42:00Z')).toBe('19 h 42');
  expect(formatWhen('2026-11-07T18:42:00Z', now)).toBe('à 19 h 42');
  expect(formatWhen('2026-11-05T21:10:00Z', now)).toBe('le 5 nov. à 22 h 10');
});

test('an age says how long ago', () => {
  const now = Date.parse('2026-11-07T12:00:00Z');
  expect(formatAge('2026-11-07T11:59:40Z', now)).toBe('à l’instant');
  expect(formatAge('2026-11-07T11:52:00Z', now)).toBe('il y a 8 min');
  expect(formatAge('2026-11-07T10:00:00Z', now)).toBe('il y a 2 h');
  expect(formatAge('2026-11-05T12:00:00Z', now)).toBe('il y a 2 jours');
});

test('a match time reads like a scoreboard', () => {
  expect(formatClock('2026-11-07T20:40:00Z')).toBe('21:40');
});

test('a tab’s day and a club month are written out in full', () => {
  // 23 h 30 UTC on Saturday is already Sunday in Paris.
  expect(formatLongDay('2026-11-07T18:30:00Z')).toBe('Samedi 7 novembre');
  expect(formatLongDay('2026-11-07T23:30:00Z')).toBe('Dimanche 8 novembre');
  expect(formatMonth('2026-11')).toBe('Novembre');
  expect(formatMonth('2027-08')).toBe('Août');
});

test('a day, a week and a month read short in the period pickers', () => {
  expect(formatShortDay('2026-11-03')).toBe('Mar. 3 nov.');
  expect(formatDayDate('2026-11-03')).toBe('3 nov.');
  expect(formatWeek('2026-10-26')).toBe('26 oct. – 1 nov.');
  expect(formatShortMonth('2026-10')).toBe('Oct. 2026');
});
