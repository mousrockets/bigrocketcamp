import { expect, test } from 'vitest';
import { dayIn } from './day';

test('a match played after midnight in Paris belongs to the next day', () => {
  expect(dayIn('Europe/Paris', new Date('2026-11-04T23:30:00Z'))).toBe('2026-11-05');
});

test('the same moment can be another day in another time zone', () => {
  expect(dayIn('America/Montreal', new Date('2026-11-04T23:30:00Z'))).toBe('2026-11-04');
});
