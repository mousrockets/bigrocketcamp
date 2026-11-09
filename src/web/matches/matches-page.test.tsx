import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { aResult, boardWith, renderInApp } from '../test-utils';
import { MatchesPage } from './matches-page';

// The Matchs tab: the day's summary per player, and the replay by part of day.

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-07T21:00:00Z'));
});
afterEach(() => vi.useRealTimers());

/** Alice and Bob in the same 2v2 match, against two strangers. */
const duo = (guid: string, received: string, parts: { won: boolean; forfeit?: boolean; overtime?: boolean }) => {
  const common = {
    match_guid: guid,
    received,
    winner: parts.won ? 0 : 1,
    forfeit: parts.forfeit ?? null,
    overtime: parts.overtime ?? null,
  };
  return [
    aResult({ ...common, name: 'alice', score: 400 }),
    aResult({ ...common, name: 'bob', score: 250 }),
    aResult({ ...common, name: 'stranger-1', player_id: 'Epic|s1|0', team: 1, score: 300 }),
    aResult({ ...common, name: 'stranger-2', player_id: 'Epic|s2|0', team: 1, score: 200 }),
  ];
};

const board = boardWith({
  results: [
    ...duo('evening-loss', '2026-11-07T20:40:00Z', { won: false, overtime: true }),
    ...duo('evening-ff', '2026-11-07T20:28:00Z', { won: true, forfeit: true }),
    ...duo('afternoon-win', '2026-11-07T15:02:00Z', { won: true }),
    ...duo('yesterday-loss', '2026-11-06T20:00:00Z', { won: false }).map((row) => ({ ...row, day: '2026-11-06' })),
  ],
  matchRosters: ['evening-loss', 'evening-ff', 'afternoon-win', 'yesterday-loss'].map((match_guid) => ({
    match_guid,
    expected_players: 4,
  })),
});

test('sums up the day of each player, the member first', async () => {
  renderInApp(<MatchesPage />, { board });
  const summary = await screen.findByRole('region', { name: 'Bilan du jour' });
  expect(within(summary).getByRole('heading', { name: 'Les bras vont chauffer' })).toBeInTheDocument();
  const [alice, bob] = within(summary)
    .getAllByText(/parties/)
    .map((line) => line.closest('[data-slot=card]') as HTMLElement);
  expect(alice).toHaveTextContent('alice');
  expect(alice).toHaveTextContent('TOI');
  expect(alice).toHaveTextContent('3 parties · 2 V · 1 D');
  // One defeat (5), no bonus, one forfeit won (−5): nothing to do.
  expect(alice).toHaveTextContent('mains propres');
  // Bob scored less than Alice in the defeat: 5 + 5 bonus − 5 dodged.
  expect(bob).toHaveTextContent('5pompes à faire');
  expect(bob).toHaveTextContent('Esquivées−5');
});

test('a forfeit won dodges nothing the days the club turned the −5 off', async () => {
  const rules = { ...board.rules, forfeit: [{ effectiveFrom: '2026-11-07', enabled: false }] };
  renderInApp(<MatchesPage />, { board: { ...board, rules } });
  const summary = await screen.findByRole('region', { name: 'Bilan du jour' });
  const [alice, bob] = within(summary)
    .getAllByText(/parties/)
    .map((line) => line.closest('[data-slot=card]') as HTMLElement);
  expect(alice).toHaveTextContent('5pompes à faire');
  expect(bob).toHaveTextContent('10pompes à faire');
  expect(bob).not.toHaveTextContent('Esquivées−5');
});

test('from 1000 points, a player dodges 10 pushups, and the replay says why', async () => {
  const highScore = duo('night-loss', '2026-11-07T20:50:00Z', { won: false }).map((row) =>
    row.name === 'alice' ? { ...row, score: 1240 } : row,
  );
  renderInApp(<MatchesPage />, { board: { ...board, results: [...highScore, ...board.results] } });
  const summary = await screen.findByRole('region', { name: 'Bilan du jour' });
  const [alice] = within(summary)
    .getAllByText(/parties/)
    .map((line) => line.closest('[data-slot=card]') as HTMLElement);
  // Two defeats (10), one forfeit won (−5), one game from 1000 points (−10): nothing to do.
  expect(alice).toHaveTextContent('4 parties · 2 V · 2 D');
  expect(alice).toHaveTextContent('Esquivées−15');
  expect(alice).toHaveTextContent('mains propres');
  const replay = await screen.findByRole('region', { name: 'Derniers matchs' });
  const line = within(replay).getByText(/1 240 pts/);
  expect(line).toHaveTextContent('· 1 240 pts · 1 000+ pts');
  expect(line.closest('span.flex')).toHaveTextContent('−5');
  expect(within(replay).getAllByText(/1 000\+ pts/)).toHaveLength(1);
});

test('a player who left before the end loses the match: the replay says so, and his summary counts it', async () => {
  // Bob left with 1100 points; Alice won without him.
  const left = duo('night-left', '2026-11-07T20:50:00Z', { won: true }).map((row) =>
    row.name === 'bob' ? { ...row, winner: 1, score: 1100, left: true } : row,
  );
  renderInApp(<MatchesPage />, {
    board: {
      ...board,
      results: [...left, ...board.results],
      matchRosters: [...board.matchRosters, { match_guid: 'night-left', expected_players: 3 }],
    },
  });
  const summary = await screen.findByRole('region', { name: 'Bilan du jour' });
  const [alice, bob] = within(summary)
    .getAllByText(/parties/)
    .map((line) => line.closest('[data-slot=card]') as HTMLElement);
  expect(alice).toHaveTextContent('4 parties · 3 V · 1 D');
  expect(alice).toHaveTextContent('mains propres');
  // A defeat of 5 more, with no bonus nor the −10 of his 1100 points.
  expect(bob).toHaveTextContent('4 parties · 2 V · 2 D');
  expect(bob).toHaveTextContent('10pompes à faire');
  expect(bob).toHaveTextContent('Bonus+5');
  expect(bob).toHaveTextContent('Esquivées−5');
  const replay = await screen.findByRole('region', { name: 'Derniers matchs' });
  const line = within(replay).getByText(/1 100 pts/);
  expect(line).toHaveTextContent('· 1 100 pts · a quitté');
  expect(line).not.toHaveTextContent('1 000+ pts');
  expect(line.closest('span.flex')).toHaveTextContent('+5');
  expect(within(replay).getByText('21:50 · Un joueur est parti')).toBeInTheDocument();
  expect(within(replay).getAllByText('GG')).toHaveLength(3);
});

test('replays the week by part of day, with how each match ended', async () => {
  renderInApp(<MatchesPage />, { board });
  const replay = await screen.findByRole('region', { name: 'Derniers matchs' });
  const labels = within(replay)
    .getAllByText(/^(Ce soir|Cet après-midi|Ce matin|Hier)$/)
    .map((label) => label.textContent);
  expect(labels).toEqual(['Ce soir', 'Cet après-midi', 'Hier']);
  expect(within(replay).getByText('21:40 · Prolongation')).toBeInTheDocument();
  expect(within(replay).getByText('21:28 · Les adversaires ont FF')).toBeInTheDocument();
  expect(within(replay).getAllByText('GG')).toHaveLength(2);
  expect(within(replay).getAllByText('AÏE')).toHaveLength(2);
});

test('says when nobody played today', async () => {
  renderInApp(<MatchesPage />, { board: boardWith() });
  expect(await screen.findByText('Aucun match aujourd’hui. Le terrain attend son kickoff.')).toBeInTheDocument();
  expect(screen.getByText('Pas un match cette semaine. Suspect.')).toBeInTheDocument();
});

test('leads to the club’s rules', async () => {
  renderInApp(<MatchesPage />, { board: boardWith(), path: '/matchs' });
  expect(await screen.findByRole('link', { name: 'Les règles' })).toHaveAttribute('href', '/matchs?regles=true');
});
