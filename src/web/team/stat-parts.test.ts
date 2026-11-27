import { expect, test } from 'vitest';
import { formatted, gapOf } from './stat-parts';

test('a small share shows its two decimals: one match left among 366 is 0,27 %, not 0 %', () => {
  expect(formatted((1 / 366) * 100, 'percent')).toBe('0,27\u00a0%');
  expect(formatted(0.6, 'percent')).toBe('0,60\u00a0%');
  expect(formatted(0, 'percent')).toBe('0\u00a0%');
  expect(formatted(12.4, 'percent')).toBe('12\u00a0%');
});

test('a gap under a point shows its two decimals, which the rounding would hide', () => {
  expect(gapOf(12.5, 12.1, 'percent')).toBe('0,40 point');
  expect(gapOf(14, 12, 'percent')).toBe('2 points');
  expect(gapOf(1.003, 1, 'perMatch')).toBe('moins de 0,01 par match');
  expect(gapOf(1.5, 1, 'perMatch')).toBe('0,50 par match');
});
