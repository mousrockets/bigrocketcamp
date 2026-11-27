import { expect, test } from 'vitest';
import { sessionEnd } from './play-session';

// A play session left open ends on its own: half an hour after a rating last moved, four hours at most.

const start = '2026-11-27T20:00:00.000Z';
const at = (minutes: number) => new Date(Date.parse(start) + minutes * 60_000).toISOString();

test('a session the member stopped ends when they stopped it', () => {
  expect(sessionEnd({ startedAt: start, stoppedAt: at(42) }, at(40))).toBe(at(42));
});

test('a session left open ends half an hour after a rating last moved', () => {
  // Nothing moved since it started: half an hour after the start.
  expect(sessionEnd({ startedAt: start, stoppedAt: null }, null)).toBe(at(30));
  expect(sessionEnd({ startedAt: start, stoppedAt: null }, at(-90))).toBe(at(30));
  // Each move keeps it going.
  expect(sessionEnd({ startedAt: start, stoppedAt: null }, at(70))).toBe(at(100));
});

test('no session lasts longer than four hours', () => {
  expect(sessionEnd({ startedAt: start, stoppedAt: null }, at(235))).toBe(at(240));
});
