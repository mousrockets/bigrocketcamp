import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { anExercise, aRank, aResult, boardWith, renderInApp } from '../test-utils';
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

test('opens the ranks’ ladder from the team', async () => {
  renderInApp(<TeamPage />, { board });
  expect(await screen.findByRole('link', { name: 'Les ranks' })).toHaveAttribute('href', '/?ranks=true');
});

test('opens the club’s rules from the member’s challenges', async () => {
  renderInApp(<TeamPage />, { board });
  const debt = await screen.findByRole('region', { name: 'Ta dette' });
  expect(within(debt).getByRole('link', { name: 'Les règles' })).toHaveAttribute('href', '/?regles=true');
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
