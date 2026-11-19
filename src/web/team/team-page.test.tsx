import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { SoloRank } from '../../lib/contract';
import { soundOf, sounds } from '../../lib/sounds';
import { anExercise, aRank, aResult, aSoloRank, boardWith, renderInApp, setViewportWidth } from '../test-utils';
import { TeamPage } from './team-page';

const now = new Date('2026-11-07T18:30:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());

const board = boardWith({
  results: [
    aResult({ name: 'alice', match_guid: 'm1' }),
    aResult({ name: 'alice', match_guid: 'm2' }),
    aResult({ name: 'bob', match_guid: 'm3' }),
  ],
  exercises: [
    anExercise({ id: 'exercise-0000000001', player: 'alice', count: 4, day: '2026-11-06' }),
    anExercise({ id: 'exercise-0000000002', player: 'alice', count: 2, day: '2026-11-07' }),
  ],
  doublesRanks: [
    aRank({
      player: 'bob',
      mmr: 1362,
      label: 'Champion III · Division II',
      tier: 18,
      fetchedAt: '2026-11-07T18:22:00Z',
      peak: { mmr: 1391, label: 'Champion III · Division III', tier: 18 },
    }),
  ],
});

test('shows the member’s own debt, paid share and streak', async () => {
  renderInApp(<TeamPage />, { board });
  const debt = await screen.findByRole('region', { name: 'Ta dette' });
  // Two defeats owe 10 pushups; 6 were done.
  expect(within(debt).getByText('4')).toBeInTheDocument();
  expect(within(debt).getByText('pompes')).toBeInTheDocument();
  expect(within(debt).getByText('6 / 10')).toBeInTheDocument();
  expect(within(debt).getByText('60 %')).toBeInTheDocument();
  expect(within(debt).getByText('2 jours')).toBeInTheDocument();
  expect(within(debt).getByRole('link', { name: 'Lancer une série' })).toHaveAttribute('href', '/?declarer=true');
});

test('puts the member’s card first, then the other players with their ranks', async () => {
  renderInApp(<TeamPage />, { board });
  const cards = await screen.findAllByRole('group');
  expect(cards).toHaveLength(2);
  expect(cards[0]).toHaveTextContent('alice');
  expect(cards[0]).toHaveTextContent('TOI');
  expect(cards[1]).toHaveTextContent('bob');
  expect(cards[1]).toHaveTextContent('Champion III');
  expect(cards[1]).toHaveTextContent('Division II');
  expect(cards[1]).toHaveTextContent('1 362');
  expect(cards[1]).toHaveTextContent('Champion III · Div. III');
  expect(cards[1]).toHaveTextContent('Actualisé il y a 8 min');
  expect(cards[1]).toHaveTextContent('Pas de compte solo');
});

/** Bob's card, his solo account read at a rating. */
async function bobsCardAt(solo: { mmr: number; tier: number; label: string }) {
  const bob = aRank({ player: 'bob', mmr: 1362, label: 'Champion III · Division II', tier: 18, solo: aSoloRank(solo) });
  renderInApp(<TeamPage />, { board: { ...board, doublesRanks: [bob] } });
  const cards = await screen.findAllByRole('group');
  return cards[1] as HTMLElement;
}

test('shows how far a solo account is from its next rank, not the duo’s', async () => {
  const card = await bobsCardAt({ mmr: 1509, tier: 19, label: 'Grand Champion I · Division III' });
  const climb = within(card).getByRole('progressbar', { name: 'Vers Grand Champion II' });
  // Grand Champion I is won at 1 435, Grand Champion II at 1 575.
  expect(climb).toHaveAttribute('aria-valuenow', '53');
  expect(climb).toHaveTextContent('1 435Encore 66 MMR1 575');
  expect(within(climb).getByRole('img', { name: 'Grand Champion II' })).toHaveAttribute(
    'src',
    '/rocket-league/ranks/20.png',
  );
  expect(within(card).getAllByRole('progressbar', { name: /^Vers / })).toHaveLength(1);
});

test('counts no MMR left once the next rank’s MMR is won, before the game promotes', async () => {
  const card = await bobsCardAt({ mmr: 1200, tier: 16, label: 'Champion I · Division IV' });
  expect(within(card).getByRole('progressbar', { name: 'Vers Champion II' })).toHaveTextContent('Encore 0 MMR');
});

test('shows no way up at the top of the ladder', async () => {
  const card = await bobsCardAt({ mmr: 1900, tier: 22, label: 'Supersonic Legend' });
  expect(within(card).queryByRole('progressbar', { name: /^Vers / })).not.toBeInTheDocument();
});

/** Bob's card, his solo account read at 1 509 with a season peak, and a best rating every season. */
async function bobsCardWithBest(best: Partial<SoloRank>) {
  const solo = aSoloRank({
    mmr: 1509,
    tier: 19,
    label: 'Grand Champion I · Division III',
    peak: { mmr: 1538, label: 'Grand Champion I · Division IV', tier: 19 },
    ...best,
  });
  const bob = aRank({ player: 'bob', mmr: 1362, label: 'Champion III · Division II', tier: 18, solo });
  renderInApp(<TeamPage />, {
    board: { ...board, doublesRanks: [{ ...bob, peak: board.doublesRanks[0]?.peak ?? null }] },
  });
  return (await screen.findAllByRole('group'))[1] as HTMLElement;
}

test('shows the solo account’s peak all time under its season peak, and none for the duo', async () => {
  const card = await bobsCardWithBest({
    best: 1612,
    bestRank: { mmr: 1612, label: 'Grand Champion II · Division II', tier: 20 },
  });
  expect(
    within(card)
      .getAllByText(/^Peak /)
      .map((title) => title.textContent),
  ).toEqual(['Peak saison', 'Peak all time', 'Peak saison']);
  const allTime = within(card).getByText('Peak all time').closest('[data-slot=item]') as HTMLElement;
  expect(allTime).toHaveTextContent('Grand Champion II · Div. II');
  expect(allTime).toHaveTextContent('1 612');
  expect(allTime.querySelector('img')).toHaveAttribute('src', '/rocket-league/ranks/20.png');
});

test('a best rating set by hand shows the rank and division it wins on the ladder', async () => {
  const card = await bobsCardWithBest({ best: 1560, bestRank: null });
  const allTime = within(card).getByText('Peak all time').closest('[data-slot=item]') as HTMLElement;
  expect(allTime).toHaveTextContent('Grand Champion I · Div. IV1 560');
  expect(allTime.querySelector('img')).toHaveAttribute('src', '/rocket-league/ranks/19.png');
});

test('no peak all time while the solo account has no best rating', async () => {
  const card = await bobsCardWithBest({ best: null, bestRank: null });
  expect(within(card).queryByText('Peak all time')).not.toBeInTheDocument();
});

test('says how many placement matches an account played, in place of its division', async () => {
  const placing = aRank({
    player: 'bob',
    mmr: 1150,
    label: 'Champion I',
    tier: 16,
    placements: 3,
    solo: aSoloRank({ mmr: 1154, tier: 16, label: 'Champion I', placements: 7 }),
  });
  renderInApp(<TeamPage />, { board: { ...board, doublesRanks: [placing] } });
  const card = (await screen.findAllByRole('group'))[1] as HTMLElement;
  expect(within(card).getByText('Placement · 7/10')).toBeInTheDocument();
  expect(within(card).getByText('Placement · 3/10')).toBeInTheDocument();
});

test('shows on each card the share of pushups paid back, then how many', async () => {
  renderInApp(<TeamPage />, { board });
  const [mine] = await screen.findAllByRole('group');
  const card = mine as HTMLElement;
  expect(within(card).getByText('60 %')).toBeInTheDocument();
  expect(within(card).getByRole('progressbar', { name: 'Dette de alice' })).toHaveAttribute('aria-valuenow', '60');
  expect(within(card).getByText('6 / 10 remboursées')).toBeInTheDocument();
});

test('opens the ranks’ ladder from the team', async () => {
  renderInApp(<TeamPage />, { board });
  expect(await screen.findByRole('link', { name: 'Les ranks' })).toHaveAttribute('href', '/?ranks=true');
});

test('opens the club’s rules from the member’s challenges', async () => {
  renderInApp(<TeamPage />, { board });
  const debt = await screen.findByRole('region', { name: 'Ta dette' });
  expect(within(debt).getByRole('link', { name: 'Les règles' })).toHaveAttribute('href', '/?regles=true');
});

test('links the day’s summary from the team on a computer', async () => {
  setViewportWidth(1440);
  try {
    renderInApp(<TeamPage />, { board });
    expect(await screen.findByRole('link', { name: 'Bilan du jour' })).toHaveAttribute('href', '/matchs');
  } finally {
    setViewportWidth(1024);
  }
});

test('leaves the day’s summary to the tab bar on a phone', async () => {
  setViewportWidth(390);
  try {
    renderInApp(<TeamPage />, { board });
    await screen.findByRole('link', { name: 'Les ranks' });
    expect(screen.queryByRole('link', { name: 'Bilan du jour' })).not.toBeInTheDocument();
  } finally {
    setViewportWidth(1024);
  }
});

test('says Direct while a collector sends matches, and when the last one came in', async () => {
  renderInApp(<TeamPage />, {
    board: { ...board, collectors: [{ id: 'collector', last_seen: '2026-11-07T18:25:00Z' }] },
  });
  expect(await screen.findByText('Direct')).toBeInTheDocument();
  expect(screen.getByText('Actualisé à 19 h 25')).toBeInTheDocument();
});

test('drops Direct once nobody has played for a quarter of an hour', async () => {
  renderInApp(<TeamPage />, {
    board: { ...board, collectors: [{ id: 'collector', last_seen: '2026-11-07T18:00:00Z' }] },
  });
  expect(await screen.findByText('Actualisé à 19 h 00')).toBeInTheDocument();
  expect(screen.queryByText('Direct')).not.toBeInTheDocument();
});

test('shows a settled debt in green, with its own line', async () => {
  renderInApp(<TeamPage />, { board: { ...board, results: [] } });
  expect(await screen.findByText('Ardoise propre. Le free play t’attend.')).toBeInTheDocument();
});

test('a player’s pseudo opens the sheet of their stats', async () => {
  const stats = boardWith({
    results: [
      aResult({ name: 'bob', match_guid: 'won', winner: 0, score: 620, goals: 2, assists: 1, saves: 3 }),
      aResult({ name: 'stranger', player_id: 'Epic|s|0', match_guid: 'won', winner: 0, score: 400 }),
      aResult({ name: 'foe', player_id: 'Epic|f|0', match_guid: 'won', team: 1, winner: 0, score: 500 }),
      aResult({ name: 'bob', match_guid: 'lost', goals: 1, saves: 2 }),
      aResult({ name: 'bob', match_guid: 'doubt', goals: 9, review_required: true }),
    ],
    matchRosters: [{ match_guid: 'won', expected_players: 3 }],
  });
  renderInApp(<TeamPage />, { board: stats });
  const link = await screen.findByRole('link', { name: 'Stats de bob' });
  expect(link).toHaveAttribute('href', '/?fiche=1');
});

test('the sheet adds up every match of the player, the disputed ones aside', async () => {
  const stats = boardWith({
    results: [
      aResult({ name: 'bob', match_guid: 'won', winner: 0, score: 620, goals: 2, assists: 1, saves: 3 }),
      aResult({ name: 'stranger', player_id: 'Epic|s|0', match_guid: 'won', winner: 0, score: 400 }),
      aResult({ name: 'foe', player_id: 'Epic|f|0', match_guid: 'won', team: 1, winner: 0, score: 500 }),
      aResult({ name: 'bob', match_guid: 'lost', goals: 1, saves: 2 }),
      aResult({ name: 'bob', match_guid: 'doubt', goals: 9, review_required: true }),
    ],
    matchRosters: [{ match_guid: 'won', expected_players: 3 }],
  });
  renderInApp(<TeamPage />, { board: stats, path: '/?fiche=1' });
  const sheet = await screen.findByRole('dialog', { name: 'bob' });
  expect(within(sheet).getByRole('region', { name: 'Matchs joués' })).toHaveTextContent(
    'Matchs joués1 W · 1 L · 50 % de victoires2',
  );
  const figures = within(sheet).getByRole('region', { name: 'Statistiques' });
  expect(figures).toHaveTextContent('3Buts1Passes D5Arrêts1MVP');
});

test('the sheet counts demolitions and posts once the collector sends them, and says when it does not yet', async () => {
  const stats = boardWith({
    results: [
      aResult({ name: 'bob', match_guid: 'new', demos: 3, crossbar_hits: 1 }),
      aResult({ name: 'bob', match_guid: 'newer', demos: 2, crossbar_hits: 0 }),
      aResult({ name: 'bob', match_guid: 'old' }),
      aResult({ name: 'alice', match_guid: 'older' }),
    ],
  });
  renderInApp(<TeamPage />, { board: stats, path: '/?fiche=1' });
  const bob = await screen.findByRole('dialog', { name: 'bob' });
  expect(within(bob).getByRole('region', { name: 'Statistiques' })).toHaveTextContent('5Démos1Poteaux');
  expect(within(bob).queryByText(/mise à jour du collecteur/)).not.toBeInTheDocument();
});

test('the sheet shows the longest win streak and lose streak, in the order the matches were played', async () => {
  const played = (match_guid: string, day: string, received: string, won: boolean, left = false) =>
    aResult({ name: 'bob', match_guid, day, received, team: 0, winner: won ? 0 : 1, left });
  const stats = boardWith({
    results: [
      // Rows arrive out of order: a late import of the 4th still counts on its day.
      played('d', '2026-11-04', '2026-11-04T20:00:00Z', true),
      played('a', '2026-11-03', '2026-11-03T20:00:00Z', false),
      played('b', '2026-11-03', '2026-11-03T20:10:00Z', false),
      played('c', '2026-11-03', '2026-11-03T20:20:00Z', true),
      played('e', '2026-11-04', '2026-11-04T20:10:00Z', true),
      played('f', '2026-11-04', '2026-11-04T20:20:00Z', true),
      // Leaving early loses the match, whatever the team did after.
      played('g', '2026-11-05', '2026-11-05T20:00:00Z', true, true),
      played('h', '2026-11-05', '2026-11-05T20:10:00Z', false),
      played('i', '2026-11-05', '2026-11-05T20:20:00Z', false),
    ],
  });
  renderInApp(<TeamPage />, { board: stats, path: '/?fiche=1' });
  const bob = await screen.findByRole('dialog', { name: 'bob' });
  expect(within(bob).getByRole('region', { name: 'Streaks' })).toHaveTextContent('4Win streak max3Lose streak max');
});

test('before any match with them, demolitions and posts show a dash', async () => {
  renderInApp(<TeamPage />, {
    board: boardWith({ results: [aResult({ name: 'bob', match_guid: 'old' })] }),
    path: '/?fiche=1',
  });
  const bob = await screen.findByRole('dialog', { name: 'bob' });
  expect(within(bob).getByRole('region', { name: 'Statistiques' })).toHaveTextContent('–Démos–Poteaux');
  expect(within(bob).getByText('Démos et poteaux se comptent dès la mise à jour du collecteur.')).toBeInTheDocument();
});

test('celebrates on a card the rank a player climbed since the last visit', async () => {
  localStorage.setItem('rl-seen', JSON.stringify({ 'rank:bob': 16 }));
  renderInApp(<TeamPage />, { board });
  const cards = await screen.findAllByRole('group');
  expect(await within(cards[1] as HTMLElement).findByRole('status')).toHaveTextContent('Rank upChampion III');
  expect(JSON.parse(localStorage.getItem('rl-seen') ?? '{}')).toMatchObject({ 'rank:bob': 18 });
  localStorage.clear();
});

test('celebrates no rank on a first visit', async () => {
  renderInApp(<TeamPage />, { board });
  const cards = await screen.findAllByRole('group');
  expect(within(cards[1] as HTMLElement).queryByRole('status')).not.toBeInTheDocument();
  localStorage.clear();
});

test('sends a +1 up when the member’s streak grew since the last visit', async () => {
  localStorage.setItem('rl-seen', JSON.stringify({ streak: 1 }));
  renderInApp(<TeamPage />, { board });
  const debt = await screen.findByRole('region', { name: 'Ta dette' });
  expect(await within(debt).findByText('+1')).toBeInTheDocument();
  localStorage.clear();
});

test('the sheet shows the player’s sound badges, and a won one plays its sound', async () => {
  const original = globalThis.fetch;
  const [won, twice] = [sounds[0].id, sounds[1].id];
  globalThis.fetch = (async () =>
    Response.json({
      collections: [
        {
          player: 'bob',
          badges: [
            { sound: won, count: 1 },
            { sound: twice, count: 2 },
          ],
        },
        { player: 'alice', badges: [{ sound: sounds[2].id, count: 1 }] },
      ],
    })) as unknown as typeof fetch;
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  renderInApp(<TeamPage />, { board, path: '/?fiche=1' });
  const sheet = await screen.findByRole('dialog', { name: 'bob' });
  const badges = within(sheet).getByRole('region', { name: 'Badges sons' });
  expect(await within(badges).findByText(`/${sounds.length}`)).toBeInTheDocument();
  expect(within(badges).getAllByRole('img', { name: 'Badge à débloquer' })).toHaveLength(sounds.length - 2);
  expect(within(badges).getByRole('button', { name: `${soundOf(twice).name}, gagné 2 fois` })).toBeInTheDocument();
  within(badges)
    .getByRole('button', { name: soundOf(won).name })
    .click();
  expect(play).toHaveBeenCalled();
  play.mockRestore();
  globalThis.fetch = original;
});
