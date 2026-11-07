import { expect, test } from 'vitest';
import { navSectionOf } from './nav-section';

test('a page lights the entry it belongs to', () => {
  expect(navSectionOf('/', false)).toBe('/');
  expect(navSectionOf('/recap', false)).toBe('/');
  expect(navSectionOf('/joueurs/2', true)).toBe('/');
  expect(navSectionOf('/matchs/abc', false)).toBe('/matchs');
  expect(navSectionOf('/defi/bilans', false)).toBe('/defi');
  expect(navSectionOf('/reglages/membres', true)).toBe('/profil');
  expect(navSectionOf('/connexions', false)).toBe('/profil');
  expect(navSectionOf('/direct/', false)).toBe('/profil');
  expect(navSectionOf('/profilage', false)).toBeNull();
});

test('the exercise history has its own entry only on a wide screen', () => {
  expect(navSectionOf('/exercices', true)).toBe('/exercices');
  expect(navSectionOf('/exercices', false)).toBe('/profil');
});
