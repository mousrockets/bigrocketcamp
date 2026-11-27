import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fakeApi, writes } from '../settings/fake-api';
import { aRank, aResult, aSoloRank, boardWith, renderInApp, testClub } from '../test-utils';
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
  expect(await screen.findByRole('link', { name: 'Statistiques' })).toHaveAttribute('href', '/stats');
  renderInApp(<StatsPage />, { board, path: '/stats' });
  expect(await screen.findByRole('link', { name: 'L’équipe' })).toHaveAttribute('href', '/');
  // The ranks' ladder opens over Stats, as the rules over Défis.
  expect(screen.getByRole('link', { name: 'Les ranks' })).toHaveAttribute('href', '/stats?ranks=true');
});

/** Ticks or unticks an entry of one of the page's lists, then closes it. */
async function pick(list: string, entry: string) {
  await userEvent.click(await screen.findByRole('combobox', { name: list }));
  await userEvent.click(await screen.findByRole('option', { name: entry }));
  await userEvent.keyboard('{Escape}');
}

test('opens on the season under way, in 2v2, on every account', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats' });
  expect(await screen.findByRole('combobox', { name: 'Saison' })).toHaveTextContent('Saison 24 (en cours)');
  expect(screen.getByRole('combobox', { name: 'Mode' })).toHaveTextContent('2v2');
  const goals = screen.getByRole('region', { name: 'Buts / match' });
  // Alice: 4 goals in 2 matches; Bob: 1.
  expect(within(goals).getAllByText('alice')).not.toHaveLength(0);
  expect(within(goals).getByText('0,50')).toBeInTheDocument();
});

test('a key figure shows the member’s own in big, above every player’s bar', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats' });
  // This season Alice leads: 2 goals a match, Bob 0,5.
  const goals = await screen.findByRole('region', { name: 'Buts / match' });
  expect(goals).toHaveTextContent(/^Buts \/ match2,00\s*1alice.*Face aux prosZen1,58$/);
});

test('a key figure shows the member’s own even when another leads it', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats?saison=23' });
  // In season 23, Bob scored 4, Alice none: her 0 shows, behind him.
  const goals = await screen.findByRole('region', { name: 'Buts / match' });
  expect(goals).toHaveTextContent(/^Buts \/ match0,00\s*1bob/);
});

test('a key figure the pros have opens them, and one they lack does not', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats' });
  expect(await screen.findByRole('link', { name: 'Buts / match face aux pros' })).toHaveAttribute(
    'href',
    '/stats?pros=buts',
  );
  expect(within(screen.getByRole('region', { name: 'Matchs' })).queryByRole('link')).not.toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Démos / match' })).queryByRole('link')).not.toBeInTheDocument();
});

test('measures the member against Zen first, then any pro or their average, among the club and the pros', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats?pros=buts' });
  const sheet = await screen.findByRole('dialog', { name: 'Face aux pros' });
  // Alice scores 2 a match this season, Zen 1,58: Atow, at 1,75, is the closest.
  expect(within(sheet).getByRole('combobox', { name: 'Pro comparé' })).toHaveTextContent('Zen');
  expect(sheet).toHaveTextContent('Tu fais mieux que Zen.');
  expect(sheet).toHaveTextContent('Le pro le plus proche de toi : Atow, à 1,75.');
  // Ten pros and the club's two players, the best first.
  const ranking = within(sheet).getByRole('region', { name: 'Le classement' });
  expect(within(ranking).getAllByRole('listitem')).toHaveLength(12);
  expect(within(ranking).getAllByRole('listitem')[0]).toHaveTextContent('alice');
  expect(sheet).toHaveTextContent(/relevé sur RL Tracker le 27 novembre 2026/);
});

test('keeps the pro the member chose, for the sheet and every card, on every device', async () => {
  const sent = fakeApi({ 'GET /api/stats/seasons': { seasons } });
  renderInApp(<StatsPage />, { board, path: '/stats?pros=buts' });
  const sheet = await screen.findByRole('dialog', { name: 'Face aux pros' });
  await userEvent.click(within(sheet).getByRole('combobox', { name: 'Pro comparé' }));
  await userEvent.click(await screen.findByRole('option', { name: 'La moyenne des pros' }));
  expect(sheet).toHaveTextContent('1,51');
  expect(sheet).toHaveTextContent('Tu fais mieux que la moyenne des pros.');
  expect(screen.getByRole('link', { name: 'Tirs / match face aux pros', hidden: true })).toHaveTextContent(
    'Moyenne4,34',
  );
  await vi.waitFor(() =>
    expect(writes(sent)).toEqual([{ method: 'PUT', path: '/api/profile/pro', body: { pro: 'moyenne' } }]),
  );
});

test('opens on the pro the member chose before', async () => {
  const club = { ...testClub, me: { ...testClub.me, comparedPro: 'Atow' } };
  renderInApp(<StatsPage />, { club, board, path: '/stats' });
  expect(await screen.findByRole('link', { name: 'Buts / match face aux pros' })).toHaveTextContent(
    'Face aux prosAtow1,75',
  );
});

test('falls back to Zen when the pro chosen is no longer one of the list', async () => {
  const club = { ...testClub, me: { ...testClub.me, comparedPro: 'Un ancien pro' } };
  renderInApp(<StatsPage />, { club, board, path: '/stats' });
  expect(await screen.findByRole('link', { name: 'Buts / match face aux pros' })).toHaveTextContent('Zen1,58');
});

test('takes the choice back when it cannot be saved', async () => {
  fakeApi({
    'GET /api/stats/seasons': { seasons },
    'PUT /api/profile/pro': new Response(JSON.stringify({ error: 'Hors ligne.' }), { status: 503 }),
  });
  renderInApp(<StatsPage />, { board, path: '/stats?pros=buts' });
  const sheet = await screen.findByRole('dialog', { name: 'Face aux pros' });
  await userEvent.click(within(sheet).getByRole('combobox', { name: 'Pro comparé' }));
  await userEvent.click(await screen.findByRole('option', { name: 'Atow' }));
  await vi.waitFor(() => expect(within(sheet).getByRole('combobox', { name: 'Pro comparé' })).toHaveTextContent('Zen'));
});

test('tells the member what they lack to reach a pro', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats?saison=23&pros=buts' });
  const sheet = await screen.findByRole('dialog', { name: 'Face aux pros' });
  // No goal for Alice in season 23.
  expect(sheet).toHaveTextContent('Il te manque 1,58 par match pour égaler Zen.');
  expect(sheet).toHaveTextContent('Le pro le plus proche de toi : M0nkey M00n, à 1,11.');
});

test('offers the 2v2 alone when other modes are mixed in, the pros’ own mode', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats?mode=tout&pros=buts' });
  const sheet = await screen.findByRole('dialog', { name: 'Face aux pros' });
  expect(within(sheet).getByRole('link', { name: 'Voir le 2v2 seul' })).toHaveAttribute(
    'href',
    '/stats?mode=2v2&pros=buts',
  );
});

test('gives each player the pro with the same style, in Ranked 2v2 only', async () => {
  const styled = boardWith({
    results: [
      aResult({ match_guid: 't1', name: 'alice', goals: 3, saves: 4, assists: 2, playlist: 11 }),
      aResult({ match_guid: 't1', name: 'bob', goals: 1, saves: 4, assists: 1, playlist: 11 }),
    ],
  });
  renderInApp(<StatsPage />, { board: styled, path: '/stats' });
  const twins = await screen.findByRole('region', { name: 'Les jumeaux pros' });
  // Alice: 0,75 goals a save and 0,67 assists a goal, against Fairy Peak!'s 0,66 and 0,56; Bob far more of a defender.
  expect(twins).toHaveTextContent('Tu joues commeFairy Peak!');
  expect(
    within(twins)
      .getAllByRole('row')
      .map((row) => row.textContent),
  ).toEqual(['RatioToiFairy Peak!', 'Buts par arrêt0,750,66', 'Assists par but0,670,56']);
  const club = within(twins).getByRole('region', { name: 'Le club' });
  expect(
    within(club)
      .getAllByRole('listitem')
      .map((line) => line.textContent),
  ).toEqual(['bobReyyynn']);
});

test('gives no pro twin outside Ranked 2v2', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats?mode=tout' });
  await screen.findByRole('region', { name: 'Buts / match' });
  expect(screen.queryByRole('region', { name: 'Les jumeaux pros' })).not.toBeInTheDocument();
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

test('names the player of a dot, with their figure, on a tap or a hover', async () => {
  const line = (name: string, goals: number, saves: number) =>
    aResult({
      match_guid: 'styled',
      name,
      day: '2026-11-02',
      received: '2026-11-02T20:00:00Z',
      goals,
      saves,
      playlist: 11,
    });
  renderInApp(<StatsPage />, {
    board: boardWith({ results: [line('alice', 2, 1), line('bob', 1, 2)] }),
    path: '/stats',
  });
  const attack = await screen.findByRole('region', { name: 'Buts par arrêt' });
  // Both dots share a colour when both players share a rank: the bubble tells them apart.
  await userEvent.click(within(attack).getByRole('button', { name: 'bob, 0,50' }));
  const bubble = (await screen.findAllByText('bob')).find((element) => element.closest('[data-slot=popover-content]'));
  expect(bubble?.closest('[data-slot=popover-content]')).toHaveTextContent(/^bob0,50$/);
});

test('shows a past season from its address, and every match from the season list', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats?saison=23' });
  expect(await screen.findByRole('combobox', { name: 'Saison' })).toHaveTextContent('Saison 23');
  const goals = screen.getByRole('region', { name: 'Buts / match' });
  expect(within(goals).getAllByText('bob')).not.toHaveLength(0);
  expect(within(goals).getAllByText('4,00')).not.toHaveLength(0);

  await pick('Saison', 'Toutes les saisons');
  expect(await screen.findByRole('combobox', { name: 'Saison' })).toHaveTextContent('Toutes les saisons');
  const table = screen.getByRole('table');
  const wins = within(table).getByRole('rowheader', { name: 'Victoires' }).closest('tr') as HTMLElement;
  expect(within(wins).getAllByText('67 %')).toHaveLength(2);
});

test('the solo accounts are named by their own pseudo', async () => {
  const withSolo = {
    ...board,
    doublesRanks: [
      aRank({ player: 'alice', solo: aSoloRank({ pseudo: 'alice-en-solo', playerId: 'Epic|alice-solo|0' }) }),
    ],
    // A match Alice played on her solo account.
    results: [
      ...board.results,
      aResult({
        match_guid: 'solo-win',
        name: 'alice',
        player_id: 'Epic|alice-solo|0',
        day: '2026-11-05',
        received: '2026-11-05T20:00:00Z',
        winner: 0,
        playlist: 11,
      }),
    ],
  };
  renderInApp(<StatsPage />, { board: withSolo, path: '/stats' });
  // Both accounts count until one is unticked.
  await pick('Compte', 'Compte duo');
  expect(screen.getByRole('combobox', { name: 'Compte' })).toHaveTextContent('Compte solo');
  expect(await screen.findAllByText(/alice-en-solo/)).not.toHaveLength(0);
  expect(screen.queryByText('alice')).not.toBeInTheDocument();
});

test('the member finds their own line: their place in each stat, their column tinted in the table', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats' });
  const goals = await screen.findByRole('region', { name: 'Buts / match' });
  // Alice, the member, scored 2 a match, Bob 0,5.
  const [first, second] = within(goals).getAllByRole('listitem');
  expect(first).toHaveTextContent(/^1alice\s*TOI2,00$/);
  expect(second).toHaveTextContent(/^2bob0,50$/);
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
  const owl = (await screen.findByRole('heading', { name: 'Le noctambule' })).closest('li') as HTMLElement;
  // Nobody played after midnight: nobody wins it, nobody lacks anything, and every player still has a line.
  expect(
    within(owl)
      .getAllByRole('listitem')
      .map((line) => line.textContent),
  ).toEqual(['alice0', 'bob0']);
  expect(within(owl).queryByText(/Il te manque/)).not.toBeInTheDocument();
  // Two matches each: too few for a prize given to a rate, such as the matches left.
  expect(screen.queryByRole('heading', { name: 'Le fugueur' })).not.toBeInTheDocument();
  expect(screen.getByText(/Un prix au match se joue sur 5 matchs au moins/)).toBeInTheDocument();
  // No collector counted the demolitions of these matches: that prize waits.
  expect(screen.queryByRole('heading', { name: 'Le démolisseur' })).not.toBeInTheDocument();
  const goals = () =>
    within(screen.getByRole('table')).getByRole('rowheader', { name: 'Buts' }).closest('tr') as HTMLElement;
  // Alice scored 4 in 2 matches this season, Bob 1: one figure per player, per match, and no switch.
  expect(within(goals()).getByText('2,00')).toHaveClass('text-win');
  expect(within(goals()).getByText('0,50')).not.toHaveClass('text-win');
  expect(within(goals()).queryByText('4')).not.toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Chiffres du tableau' })).not.toBeInTheDocument();
  // A tap, or a hover on a computer, shows the total it comes from.
  await userEvent.click(within(goals()).getByRole('button', { name: '2,00, 4 au total' }));
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
  await pick('Mode', '2v2');
  expect(await screen.findByRole('combobox', { name: 'Mode' })).toHaveTextContent('Aucun mode');
  expect(await screen.findByText('Coche au moins un mode pour voir les stats.')).toBeInTheDocument();
  await pick('Mode', 'Tournoi 3v3');
  expect(await screen.findByText('Pas un tournoi 3v3 en saison 24. Le kickoff attend.')).toBeInTheDocument();
});

test('compares several modes and seasons at once, and every one of a list with its first line', async () => {
  const cup = aResult({ match_guid: 'cup', name: 'alice', day: '2026-11-04', received: '2026-11-04T20:00:00Z' });
  const withCup = {
    ...board,
    results: [
      ...board.results,
      { ...cup, playlist: 34, winner: 0 },
      { ...cup, name: 'bob', player_id: 'Epic|bob|0', playlist: 34, winner: 0 },
      // A casual match counts in no mode.
      { ...cup, match_guid: 'casual', playlist: 1, goals: 9 },
    ],
  };
  renderInApp(<StatsPage />, { board: withCup, path: '/stats' });
  const matches = async () =>
    within(await screen.findByRole('region', { name: 'Matchs' })).getAllByText(/^\d+$/)[0]?.textContent;
  expect(await matches()).toBe('2');
  await pick('Mode', 'Tournoi 2v2');
  expect(screen.getByRole('combobox', { name: 'Mode' })).toHaveTextContent('2v2 + Tournoi 2v2');
  expect(await matches()).toBe('3');
  // Tous les modes: the ranked playlists and the tournaments, not the casual match.
  await pick('Mode', 'Tous les modes');
  expect(screen.getByRole('combobox', { name: 'Mode' })).toHaveTextContent('Tous les modes');
  expect(await matches()).toBe('3');
  // The club played two seasons: ticking the other one picks them all.
  await pick('Saison', 'Saison 23');
  expect(screen.getByRole('combobox', { name: 'Saison' })).toHaveTextContent('Toutes les saisons');
  expect(await matches()).toBe('4');
});

test('reads its filters from its address', async () => {
  renderInApp(<StatsPage />, { board, path: '/stats?saison=tout&mode=3v3,tournoi-2v2' });
  expect(await screen.findByRole('combobox', { name: 'Saison' })).toHaveTextContent('Toutes les saisons');
  expect(screen.getByRole('combobox', { name: 'Mode' })).toHaveTextContent('3v3 + Tournoi 2v2');
});
