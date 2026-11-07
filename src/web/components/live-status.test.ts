import { expect, test } from 'vitest';
import { isLive, receptionLabel } from './live-status';

test('the club is live while a match came in within a quarter of an hour', () => {
  const now = Date.parse('2026-11-07T18:30:00Z');
  expect(isLive('2026-11-07T18:20:00Z', now)).toBe(true);
  expect(isLive('2026-11-07T18:10:00Z', now)).toBe(false);
  expect(isLive(null, now)).toBe(false);
});

test('the last reception says its time, and its date when it was not today', () => {
  const now = Date.parse('2026-11-07T18:30:00Z');
  expect(receptionLabel('2026-11-07T18:42:00Z', now)).toBe('Actualisé à 19 h 42');
  expect(receptionLabel('2026-11-05T21:10:00Z', now)).toBe('Actualisé le 5 nov. à 22 h 10');
  expect(receptionLabel(null, now)).toBe('En attente du premier match');
});
