import { expect, test } from 'vitest';
import { nextOffset, tailStart } from './dev-log';

// `npm run logs` follows .wrangler/dev.log: its last lines first, then what comes, from the start of a new run.

test('starts from the last lines the file holds', () => {
  const text = 'one\ntwo\nthree\nfour\n';
  expect(text.slice(tailStart(text, 2))).toBe('three\nfour\n');
  expect(text.slice(tailStart(text, 10))).toBe(text);
  expect(tailStart('', 5)).toBe(0);
});

test('reads on where it stopped, and from the start once a new run wrote the file over', () => {
  expect(nextOffset(120, 100)).toBe(100);
  expect(nextOffset(40, 100)).toBe(0);
});
