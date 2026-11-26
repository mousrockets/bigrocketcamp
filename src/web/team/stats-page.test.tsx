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
  // Their solo accounts' best ever: Bob's set before this season, Alice's this season.
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

/** What the API answers the Stats page about each season's ratings. */
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

test('L’équipe leads to the Stats page, which leads back', async () => {
  renderInApp(<TeamPage />, { board });
  expect(await screen.findByRole('link', { name: 'Stats' })).toHaveAttribute('href', '/stats');
  renderInApp(<StatsPage />, { board, path: '/stats' });
  expect(await screen.findByRole('link', { name: 'L’équipe' })).toHaveAttribute('href', '/');
  // The ranks' ladder opens over Stats, as the rules over Défis.
  expect(screen.getByRole('link', { name: 'Les ranks' })).toHaveAttribute('href', '/stats?ranks=true');
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

test('a key figure shows the member’s own in big, above every player’s bar', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats' });
  // This season Alice leads: 2 goals a match, Bob 0,5.
  const goals = await screen.findByRole('region', { name: 'Buts / match' });
  expect(goals).toHaveTextContent(/^Buts \/ match2\s*1alice/);
});

test('a key figure shows the member’s own even when another leads it', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats?saison=23' });
  // In season 23, Bob scored 4, Alice none: her 0 shows, behind him.
  const goals = await screen.findByRole('region', { name: 'Buts / match' });
  expect(goals).toHaveTextContent(/^Buts \/ match0\s*1bob/);
});

test('places each player’s style on two axes, against the club, with no winner', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats' });
  const style = await screen.findByRole('region', { name: 'Le style de jeu' });
  expect(style).toHaveTextContent('Pas de gagnant ici');
  const attack = within(style).getByRole('region', { name: 'Buts par arrêt' });
  expect(attack).toHaveTextContent(/DéfenseurLe clubAttaquant/);
  // Nobody saved a shot in these matches: no ratio to show.
  expect(
    within(attack)
      .getAllByRole('listitem')
      .map((line) => line.textContent),
  ).toEqual(['aliceTOI–', 'bob–']);
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

test('stands the solo accounts closest to their peak all time before the season on a podium, the duo ones a tap away', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats' });
  const podium = await screen.findByRole('region', { name: 'Au plus près de son peak all time' });
  // The ratings arrive apart from the board.
  await within(podium).findByText('+60');
  // Alice's solo beat its best before the season (1 150) by 60; Bob's stayed 60 under his (1 400).
  const [first, second] = within(podium).getAllByRole('listitem');
  expect(first).toHaveTextContent(/^\+60écart\s*alice-solo\s*TOI\s*Saison1 210\s*All time1 150/);
  expect(within(first as HTMLElement).getByText('+60')).toHaveClass('text-win');
  expect(second).toHaveTextContent(/^−60écart\s*bob-solo\s*Saison1 340\s*All time1 400/);
  expect(second).toHaveTextContent(/Place 2$/);
  // Both peaks take their rank's colour.
  expect(within(second as HTMLElement).getByText('1 340')).toHaveAttribute('style', expect.stringContaining('color'));
  expect(within(second as HTMLElement).getByText('1 400')).toHaveAttribute('style', expect.stringContaining('color'));

  await userEvent.click(within(podium).getByRole('button', { name: 'Duo' }));
  // In duo, only Bob's best before the season is known, and he has no duo peak read this season.
  expect(within(podium).queryAllByRole('listitem')).toHaveLength(0);
  expect(podium).toHaveTextContent(/Pas de peak duo relevé cette saison, ou pas de peak all time d’avant connu/);
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
  expect(await screen.findAllByText(/alice-en-solo/)).not.toHaveLength(0);
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
  const runaway = (await screen.findByRole('heading', { name: 'Le fugueur' })).closest('li') as HTMLElement;
  // Nobody left a match: nobody wins it, nobody lacks anything, and every player still has a line.
  expect(
    within(runaway)
      .getAllByRole('listitem')
      .map((line) => line.textContent),
  ).toEqual(['alice0\u00a0%0\u00a0fois', 'bob0\u00a0%0\u00a0fois']);
  expect(within(runaway).queryByText(/Il te manque/)).not.toBeInTheDocument();
  // No collector counted the demolitions of these matches: that prize waits.
  expect(screen.queryByRole('heading', { name: 'Le démolisseur' })).not.toBeInTheDocument();
  const goals = () =>
    within(screen.getByRole('table')).getByRole('rowheader', { name: 'Buts' }).closest('tr') as HTMLElement;
  // Alice scored 4 in 2 matches this season, Bob 1: one figure per player, per match, and no switch.
  expect(within(goals()).getByText('2')).toHaveClass('text-win');
  expect(within(goals()).getByText('0,5')).not.toHaveClass('text-win');
  expect(within(goals()).queryByText('4')).not.toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Chiffres du tableau' })).not.toBeInTheDocument();
  // A tap, or a hover on a computer, shows the total it comes from.
  await userEvent.click(within(goals()).getByRole('button', { name: '2, 4 au total' }));
  const bubble = await screen.findByText('Au total');
  expect(bubble.parentElement).toHaveTextContent(/^Au total4$/);
  expect(screen.getByText(/Touche ou survole un chiffre pour voir son total/)).toBeInTheDocument();
  // The table reads part by part, each one saying whether it reads per match.
  expect(
    within(screen.getByRole('table')).getByRole('columnheader', { name: 'Attaque · par match' }),
  ).toBeInTheDocument();
  expect(within(screen.getByRole('table')).getByRole('rowheader', { name: 'Lose streak max ↓' })).toBeInTheDocument();
  // The rank and the pushups have their own pages: the table keeps to the matches.
  expect(within(screen.getByRole('table')).queryByRole('columnheader', { name: 'Le rang et le club' })).toBeNull();
});

test('shows the game’s ball speeds in km/h, and what the member lacks to take a prize', async () => {
  const fast = boardWith({
    results: board.results.map((row) => ({
      ...row,
      game_stats: { hardestHit: row.name === 'alice' ? 124.2 : 181.04, statfeed: {} },
    })),
  });
  renderInApp(<StatsPage />, { board: fast, path: '/stats' });
  const cannon = (await screen.findByRole('heading', { name: 'Le canonnier' })).closest('li') as HTMLElement;
  // Bob leads; Alice, the member, sees her bar under his, and what she lacks to take the prize.
  expect(
    within(cannon)
      .getAllByRole('listitem')
      .map((line) => line.textContent),
  ).toEqual(['bob181\u00a0km/h', 'alice124\u00a0km/h']);
  expect(cannon).toHaveTextContent('Il te manque 57 km/h.');
});

test('says so when nobody played in the mode chosen', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats' });
  await pick('Mode', 'Tournoi');
  expect(await screen.findByText('Pas un match de tournoi en saison 24. Le kickoff attend.')).toBeInTheDocument();
});
