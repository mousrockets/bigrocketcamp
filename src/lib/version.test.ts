import { describe, expect, test } from 'vitest';
import { versionLabel } from './version';

describe('the deployed version label', () => {
  test('shows the short commit and the deployment time in Paris', () => {
    expect(versionLabel({ commit: 'a1b2c3d', deployedAt: '2026-11-06T20:04:59Z' })).toBe(
      'Version a1b2c3d · déployée le 06/11 à 21 h 04',
    );
    expect(versionLabel({ commit: 'a1b2c3d', deployedAt: '2026-07-01T07:05:00Z' })).toBe(
      'Version a1b2c3d · déployée le 01/07 à 09 h 05',
    );
  });

  test('a local build or an unknown date shows the commit alone', () => {
    expect(versionLabel({ commit: 'dev', deployedAt: '2026-11-06T20:04:00Z' })).toBe('Version dev');
    expect(versionLabel({ commit: 'a1b2c3d', deployedAt: null })).toBe('Version a1b2c3d');
  });
});
