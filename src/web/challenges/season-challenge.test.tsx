import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fakeApi } from '../settings/fake-api';
import { aRank, aSoloRank, boardWith, renderInApp } from '../test-utils';
import { ChallengesPage } from './challenges-page';

// The season's challenge leads Défis: Alice (the member) and Bob's solo accounts against their peak all time.

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-07T21:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** What the API answers about each season's ratings. */
const seasons = [
  {
    player: 'bob',
    account: 'solo',
    season: 24,
    first: 1300,
    last: 1280,
    peak: { mmr: 1340, label: 'Grand Champion I · Division I', tier: 19 },
  },
  {
    player: 'alice',
    account: 'solo',
    season: 24,
    first: 1100,
    last: 1184,
    peak: { mmr: 1210, label: 'Champion III · Division II', tier: 18 },
  },
  {
    player: 'alice',
    account: 'solo',
    season: 23,
    first: 1050,
    last: 1120,
    peak: { mmr: 1150, label: 'Champion II · Division IV', tier: 17 },
  },
];

// Their solo accounts' best ever: Bob's set before this season, Alice's this season.
const board = boardWith({
  doublesRanks: [
    aRank({
      player: 'bob',
      seasonStartBest: { mmr: 1300, label: 'Champion III · Division I', tier: 18 },
      solo: aSoloRank({ pseudo: 'bob-solo', seasonStartBest: { mmr: 1400, label: '', tier: null } }),
    }),
    aRank({
      player: 'alice',
      solo: aSoloRank({ pseudo: 'alice-solo', seasonStartBest: { mmr: 1150, label: '', tier: null } }),
    }),
  ],
});

test('leads Défis with the solo accounts closest to their peak all time on a podium', async () => {
  fakeApi({ 'GET /api/stats/seasons': { seasons, statfeedLabels: {} } });
  renderInApp(<ChallengesPage />, { board, path: '/defis' });
  const [first] = await screen.findAllByRole('region');
  const podium = await screen.findByRole('region', { name: 'Défi de la saison' });
  expect(first).toBe(podium);
  expect(within(podium).getByRole('navigation', { name: 'Saison affichée' })).toHaveTextContent('Saison 24');
  // The ratings arrive apart from the board.
  await within(podium).findByText('+60');
  // Alice's solo beat its best before the season (1 150) by 60; Bob's stayed 60 under his (1 400).
  const [top, second] = within(podium).getAllByRole('listitem');
  expect(top).toHaveTextContent(/^\+60écart\s*alice-solo\s*TOI\s*Saison1 210\s*All time1 150/);
  expect(within(top as HTMLElement).getByText('+60')).toHaveClass('text-win');
  expect(second).toHaveTextContent(/^−60écart\s*bob-solo\s*Saison1 340\s*All time1 400/);
  expect(second).toHaveTextContent(/Place 2$/);
  // Both peaks take their rank's colour.
  expect(within(second as HTMLElement).getByText('1 340')).toHaveAttribute('style', expect.stringContaining('color'));
  expect(within(second as HTMLElement).getByText('1 400')).toHaveAttribute('style', expect.stringContaining('color'));
  // The solo accounts only: no choice of account.
  expect(within(podium).queryByRole('button', { name: 'Duo' })).not.toBeInTheDocument();
});

test('goes back to a past season, and back to the one under way', async () => {
  fakeApi({ 'GET /api/stats/seasons': { seasons, statfeedLabels: {} } });
  renderInApp(<ChallengesPage />, { board, path: '/defis' });
  const podium = await screen.findByRole('region', { name: 'Défi de la saison' });
  await within(podium).findByText('+60');
  await userEvent.click(within(podium).getByRole('link', { name: 'Saison précédente' }));
  expect(
    await within(podium).findByRole('link', { name: 'Saison 23, revenir à la saison en cours' }),
  ).toBeInTheDocument();
  // In season 23, only Alice's solo was read, with no peak before it.
  expect(within(podium).queryAllByRole('listitem')).toHaveLength(0);
  expect(podium).toHaveTextContent(/Pas de peak solo relevé en saison 23, ou pas de peak all time d’avant connu/);
  await userEvent.click(within(podium).getByRole('link', { name: 'Saison 23, revenir à la saison en cours' }));
  expect(await within(podium).findByText('+60')).toBeInTheDocument();
});

test('says so when the ratings do not answer', async () => {
  fakeApi({ 'GET /api/stats/seasons': Response.json({ error: 'Panne.' }, { status: 500 }) });
  renderInApp(<ChallengesPage />, { board, path: '/defis' });
  expect(await screen.findByText('Les peaks n’ont pas répondu. Réessaie dans un instant.')).toBeInTheDocument();
});
