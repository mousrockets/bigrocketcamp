import { expect, test } from 'vitest';
import { playerInitials } from './players';

test('initials take the first letters of the first two words, else the first two letters', () => {
  expect(playerInitials('aile-gauche')).toBe('AG');
  expect(playerInitials('boost_max_turbo')).toBe('BM');
  expect(playerInitials('centreur')).toBe('CE');
  expect(playerInitials('relance-42')).toBe('RE');
  expect(playerInitials('42')).toBe('42');
});
