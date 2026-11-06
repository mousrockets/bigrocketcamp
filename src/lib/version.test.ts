import { describe, expect, test } from 'vitest';
import { isoDate, versionLabel } from './version';

describe('the deployed version label', () => {
  test('shows the short commit and the deployment time in Paris', () => {
    expect(versionLabel({ commit: 'a1b2c3d', deployedAt: '2026-11-06T20:04:59Z' })).toBe(
      'Version a1b2c3d · Déployée le 6 nov. 2026 à 21 h 04',
    );
    expect(versionLabel({ commit: 'a1b2c3d', deployedAt: '2026-07-01T07:05:00Z' })).toBe(
      'Version a1b2c3d · Déployée le 1 juil. 2026 à 09 h 05',
    );
  });

  test('a local build or an unknown date shows the commit alone', () => {
    expect(versionLabel({ commit: 'dev', deployedAt: '2026-11-06T20:04:00Z' })).toBe('Version dev');
    expect(versionLabel({ commit: 'a1b2c3d', deployedAt: null })).toBe('Version a1b2c3d');
    expect(versionLabel({ commit: 'a1b2c3d', deployedAt: 'not a date' })).toBe('Version a1b2c3d');
  });
});

describe('the deployment date sent by the API', () => {
  test('a microsecond timestamp becomes a millisecond ISO date', () => {
    expect(isoDate('2026-11-06T19:32:28.999444Z')).toBe('2026-11-06T19:32:28.999Z');
    expect(isoDate('')).toBeNull();
  });
});
