import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fakeApi } from '../settings/fake-api';
import { aRank, aResult, aSoloRank, boardWith, renderInApp } from '../test-utils';
import { StatsPage } from './stats-page';
import { TeamPage } from './team-page';

// The Stats page: Alice (the member) and Bob side by side, over the season under way or another one.

beforeEach(() => {
  fakeApi({ 'GET /api/stats/seasons': { seasons } });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-07T21:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const duo = (guid: string, day: string, won: boolean, goals: { alice: number; bob: number }) => [
  aResult({
    match_guid: guid,
    name: 'alice',
    day,
    received: `${day}T20:00:00Z`,
    winner: won ? 0 : 1,
    goals: goals.alice,
    playlist: 11,
  }),
  aResult({
    match_guid: guid,
    name: 'bob',
    day,
    received: `${day}T20:00:00Z`,
    winner: won ? 0 : 1,
    goals: goals.bob,
    playlist: 11,
  }),
];

const board = boardWith({
  results: [
    ...duo('s23-win', '2026-08-20', true, { alice: 0, bob: 4 }),
    ...duo('s24-win', '2026-11-02', true, { alice: 3, bob: 0 }),
    ...duo('s24-loss', '2026-11-03', false, { alice: 1, bob: 1 }),
  ],
});

/** What the API answers the Stats page about each season's ratings. */
const seasons = [
  {
    player: 'bob',
    account: 'duo',
    season: 24,
    first: 1300,
    last: 1280,
    peak: { mmr: 1340, label: 'Grand Champion I · Division I', tier: 19 },
  },
  {
    player: 'alice',
    account: 'duo',
    season: 24,
    first: 1100,
    last: 1184,
    peak: { mmr: 1210, label: 'Champion III · Division II', tier: 18 },
  },
];

test('L’équipe leads to the Stats page, which leads back', async () => {
  renderInApp(<TeamPage />, { board });
  expect(await screen.findByRole('link', { name: 'Stats' })).toHaveAttribute('href', '/stats');
  renderInApp(<StatsPage />, { board, path: '/stats' });
  expect(await screen.findByRole('link', { name: 'L’équipe' })).toHaveAttribute('href', '/');
});

/** Picks an entry of one of the page's lists. */
async function pick(list: string, entry: string) {
  await userEvent.click(await screen.findByRole('combobox', { name: list }));
  await userEvent.click(await screen.findByRole('option', { name: entry }));
}

test('opens on the season under way, in 2v2, on every account', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats' });
  expect(await screen.findByRole('combobox', { name: 'Saison' })).toHaveTextContent('Saison 24 (en cours)');
  expect(screen.getByRole('combobox', { name: 'Mode' })).toHaveTextContent('2v2');
  const goals = screen.getByRole('region', { name: 'Buts / match' });
  // Alice: 4 goals in 2 matches; Bob: 1.
  expect(within(goals).getAllByText('alice')).not.toHaveLength(0);
  expect(within(goals).getByText('0,5')).toBeInTheDocument();
});

test('shows a past season from its address, and every match from the season list', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats?saison=23' });
  expect(await screen.findByRole('combobox', { name: 'Saison' })).toHaveTextContent('Saison 23');
  const goals = screen.getByRole('region', { name: 'Buts / match' });
  expect(within(goals).getAllByText('bob')).not.toHaveLength(0);
  expect(within(goals).getAllByText('4')).not.toHaveLength(0);

  await pick('Saison', 'Toutes les saisons');
  expect(await screen.findByRole('combobox', { name: 'Saison' })).toHaveTextContent('Toutes les saisons');
  const table = screen.getByRole('table');
  const wins = within(table).getByRole('rowheader', { name: 'Victoires' }).closest('tr') as HTMLElement;
  expect(within(wins).getAllByText('67 %')).toHaveLength(2);
});

test('leads with each player’s 2v2 peak and what the season brought, the highest first', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats' });
  const peaks = await screen.findByRole('region', { name: 'Peak 2v2' });
  // The ratings arrive apart from the board.
  await within(peaks).findByText('1 340');
  const [first, second] = within(peaks).getAllByRole('listitem');
  expect(first).toHaveTextContent('bob');
  expect(first).toHaveTextContent('Grand Champion I · Division I');
  expect(first).toHaveTextContent('1 340');
  expect(first).toHaveTextContent('−20 MMR');
  expect(second).toHaveTextContent('alice');
  expect(second).toHaveTextContent('+84 MMR');
});

test('the solo accounts are named by their own pseudo', async () => {
  const withSolo = {
    ...board,
    doublesRanks: [
      aRank({ player: 'alice', solo: aSoloRank({ pseudo: 'alice-en-solo', playerId: 'Epic|alice-solo|0' }) }),
    ],
  };
  renderInApp(<StatsPage />, { board: withSolo, path: '/stats' });
  await pick('Compte', 'Compte solo');
  expect(await screen.findAllByText('alice-en-solo')).not.toHaveLength(0);
  expect(screen.queryByText('alice')).not.toBeInTheDocument();
});

test('crowns the prizes and lights the best of each line of the table', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats' });
  const assassin = await screen.findByRole('region', { name: 'Le démolisseur' });
  expect(within(assassin).getByRole('heading', { name: 'Le démolisseur' })).toBeInTheDocument();
  const goals = () =>
    within(screen.getByRole('table')).getByRole('rowheader', { name: 'Buts' }).closest('tr') as HTMLElement;
  // Alice scored 4 in 2 matches this season, Bob 1: per match first, then the totals.
  expect(within(goals()).getByText('2')).toHaveClass('text-win');
  expect(within(goals()).getByText('0,5')).not.toHaveClass('text-win');
  await userEvent.click(
    within(screen.getByRole('group', { name: 'Chiffres du tableau' })).getByRole('button', { name: 'Total' }),
  );
  expect(within(goals()).getByText('4')).toHaveClass('text-win');
  expect(within(goals()).getByText('1')).not.toHaveClass('text-win');
  expect(screen.getByText(/le meilleur de chaque ligne : le plus bas pour défaites/)).toBeInTheDocument();
});

test('says so when nobody played in the mode chosen', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats' });
  await pick('Mode', 'Tournoi');
  expect(await screen.findByText('Pas un match de tournoi en saison 24. Le kickoff attend.')).toBeInTheDocument();
});
