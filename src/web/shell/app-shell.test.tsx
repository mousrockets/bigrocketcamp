import { screen, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { renderInApp } from '../test-utils';
import { TabBar } from './app-shell';

test('the tab bar links every tab and marks the open one', async () => {
  renderInApp(<TabBar />, { path: '/matchs' });
  const navigation = await screen.findByRole('navigation', { name: 'Navigation principale' });
  for (const [tab, path] of [
    ['L’équipe', '/'],
    ['Défis', '/defis'],
    ['Matchs', '/matchs'],
    ['Réglages', '/reglages'],
  ] as const) {
    expect(within(navigation).getByRole('link', { name: tab })).toHaveAttribute('href', path);
  }
  expect(within(navigation).getByRole('link', { name: 'Matchs' })).toHaveAttribute('aria-current', 'page');
  expect(within(navigation).getByRole('link', { name: 'L’équipe' })).not.toHaveAttribute('aria-current');
  expect(within(navigation).getByRole('link', { name: 'Déclarer un exercice' })).toHaveAttribute('href', '/declarer');
});
