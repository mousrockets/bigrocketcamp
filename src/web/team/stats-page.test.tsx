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

test('the member finds their own line: their place in each stat, their column tinted in the table', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats' });
  const goals = await screen.findByRole('region', { name: 'Buts / match' });
  // Alice, the member, scored 2 a match, Bob 0,5.
  const [first, second] = within(goals).getAllByRole('listitem');
  expect(first).toHaveTextContent(/^1alice\s*TOI2$/);
  expect(second).toHaveTextContent(/^2bob0,5$/);
  // Only the member's place wears its medal, in big, and their line its capsule.
  expect(within(first as HTMLElement).getByText('1')).toHaveClass('text-medal-1', 'text-[22px]');
  expect(within(second as HTMLElement).getByText('2')).toHaveClass('text-t3', 'text-[13px]');
  expect(first).toHaveClass('bg-white/7');
  expect(second).not.toHaveClass('bg-white/7');
  const header = within(screen.getByRole('table')).getByRole('columnheader', { name: /alice/ });
  expect(header).toHaveClass('bg-white/6');
});

test('crowns the prizes and lights the best of each line of the table', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats' });
  const rageQuit = (await screen.findByRole('heading', { name: 'Rage quit' })).closest('li') as HTMLElement;
  // Nobody left a match: nobody wins it, and the member has no place to read.
  expect(rageQuit).toHaveTextContent('Personne');
  expect(within(rageQuit).queryByText(/^Toi/)).not.toBeInTheDocument();
  // No collector counted the demolitions of these matches: that prize waits.
  expect(screen.queryByRole('heading', { name: 'Le démolisseur' })).not.toBeInTheDocument();
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
  expect(screen.getByText(/le meilleur de chaque ligne ; ↓ : le plus bas est le meilleur/)).toBeInTheDocument();
  // The table reads part by part, each one saying whether it reads per match.
  expect(within(screen.getByRole('table')).getByRole('columnheader', { name: 'Attaque' })).toBeInTheDocument();
  expect(within(screen.getByRole('table')).getByRole('rowheader', { name: 'Défaites ↓' })).toBeInTheDocument();
});

test('shows the game’s ball speeds in km/h, as it sends them', async () => {
  const fast = boardWith({
    results: board.results.map((row) => ({
      ...row,
      game_stats: { hardestHit: row.name === 'alice' ? 181.04 : 124.2, statfeed: {} },
    })),
  });
  renderInApp(<StatsPage />, { board: fast, path: '/stats' });
  const cannon = (await screen.findByRole('heading', { name: 'Le canonnier' })).closest('li') as HTMLElement;
  expect(within(cannon).getAllByText('181 km/h')).not.toHaveLength(0);
});

test('says so when nobody played in the mode chosen', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats' });
  await pick('Mode', 'Tournoi');
  expect(await screen.findByText('Pas un match de tournoi en saison 24. Le kickoff attend.')).toBeInTheDocument();
});
