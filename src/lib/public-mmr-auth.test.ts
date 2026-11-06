import { describe, expect, test } from 'vitest';
import { canImportPublicMmr, publicMmrKeyMatches } from './public-mmr-auth';

const importKey = 'synthetic-mmr-import-key-1234567890';

describe('publicMmrKeyMatches', () => {
  test('accepts only the dedicated key', () => {
    expect(publicMmrKeyMatches(importKey, importKey)).toBe(true);
    expect(publicMmrKeyMatches(importKey, 'wrong-key')).toBe(false);
    expect(publicMmrKeyMatches(importKey, '')).toBe(false);
  });

  test('refuses a missing or short configured key', () => {
    expect(publicMmrKeyMatches(undefined, undefined)).toBe(false);
    expect(publicMmrKeyMatches('short', 'short')).toBe(false);
  });
});

describe('canImportPublicMmr', () => {
  test('only the configured updater may import public readings', () => {
    const settings = { MMR_UPDATER_USER_ID: 'current-user' };
    expect(canImportPublicMmr(settings, 'current-user')).toBe(true);
    expect(canImportPublicMmr(settings, 'other-1')).toBe(false);
    expect(canImportPublicMmr({}, 'current-user')).toBe(false);
    expect(canImportPublicMmr({ MMR_UPDATER_USER_ID: '' }, '')).toBe(false);
  });
});
