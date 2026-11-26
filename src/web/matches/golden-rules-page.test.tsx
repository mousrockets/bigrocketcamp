import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { renderInApp } from '../test-utils';
import { GoldenRulesPage } from './golden-rules-page';
import { MatchesPage } from './matches-page';

// Squishy's Golden Rules: four tiers, twenty rules, in French unless the member asks for English.

test('Matchs leads to the Golden Rules, which lead back to Matchs', async () => {
  renderInApp(<MatchesPage />, { path: '/matchs' });
  expect(await screen.findByRole('link', { name: 'Golden Rules' })).toHaveAttribute('href', '/matchs/golden-rules');

  renderInApp(<GoldenRulesPage />, { path: '/matchs/golden-rules' });
  expect(await screen.findByRole('link', { name: 'Matchs' })).toHaveAttribute('href', '/matchs');
});

test('shows the twenty rules in their four tiers, in French', async () => {
  renderInApp(<GoldenRulesPage />, { path: '/matchs/golden-rules' });
  const core = await screen.findByRole('region', { name: 'The Non-Negotiable Core' });
  expect(
    within(core)
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent),
  ).toEqual(['1. Proximity', '2. Play Your Role', '3. Last Man', '4. Back Wall']);
  expect(within(core).getByText(/si c’est toi, tu y vas/)).toBeInTheDocument();
  for (const tier of ['Reading the Game & Positioning', 'Control, Economy & Offense', 'High-Rank & SSL Execution']) {
    expect(screen.getByRole('region', { name: tier })).toBeInTheDocument();
  }
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(20);
  expect(screen.getByRole('heading', { name: '20. Zero Tilt & Queue Dodge' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'FR', pressed: true })).toBeInTheDocument();
});

test('switches the rules to English and back', async () => {
  renderInApp(<GoldenRulesPage />, { path: '/matchs/golden-rules' });
  const language = await screen.findByRole('group', { name: 'Langue des règles' });
  await userEvent.click(within(language).getByRole('button', { name: 'EN' }));
  expect(await screen.findByText(/if you’re closer, go/)).toBeInTheDocument();
  expect(screen.queryByText(/si c’est toi, tu y vas/)).not.toBeInTheDocument();

  await userEvent.click(within(language).getByRole('button', { name: 'FR' }));
  expect(await screen.findByText(/si c’est toi, tu y vas/)).toBeInTheDocument();
});

test('opens in English from its address', async () => {
  renderInApp(<GoldenRulesPage />, { path: '/matchs/golden-rules?langue=en' });
  expect(await screen.findByText(/Read them again before every ranked session/)).toBeInTheDocument();
  expect(screen.getByText(/if you’re closer, go/).closest('[lang]')).toHaveAttribute('lang', 'en');
});

test('sets the game’s English words in italics in the French rules', async () => {
  renderInApp(<GoldenRulesPage />, { path: '/matchs/golden-rules' });
  const gist = (await screen.findByText(/si c’est toi, tu y vas/)).closest('p') as HTMLElement;
  expect(gist).toHaveTextContent(
    'Si l’adversaire est plus proche de la balle, tu attends et tu shadow ; si c’est toi, tu y vas.',
  );
  expect(within(gist).getByText('shadow').tagName).toBe('EM');
});
