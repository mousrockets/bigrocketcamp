import { describe, expect, test } from 'vitest';
import { secretKeyMatches } from './secret-key';

const key = 'synthetic-rank-source-key-1234567890';

describe('secretKeyMatches', () => {
  test('accepts only the dedicated key', () => {
    expect(secretKeyMatches(key, key)).toBe(true);
    expect(secretKeyMatches(key, 'wrong-key')).toBe(false);
    expect(secretKeyMatches(key, '')).toBe(false);
  });

  test('refuses a missing or short configured key', () => {
    expect(secretKeyMatches(undefined, undefined)).toBe(false);
    expect(secretKeyMatches('short', 'short')).toBe(false);
  });
});
