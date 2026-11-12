import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { aRank, aResult, aSoloRank, boardWith, renderInApp } from '../test-utils';
import { MatchesPage } from './matches-page';

// The Matchs tab: the day's summary per player, and the replay by part of day.

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-07T21:00:00Z'));
});
afterEach(() => vi.useRealTimers());

/** Matchs on Saturday 7 November alone. */
const today = '/matchs?jour=2026-11-07';

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
  renderInApp(<MatchesPage />, { board, path: today });
  const summary = await screen.findByRole('region', { name: 'Bilan du jour' });
  expect(within(summary).getByRole('heading', { name: 'Les bras vont chauffer' })).toBeInTheDocument();
  const [alice, bob] = within(summary)
    .getAllByText(/parties/)
    .map((line) => line.closest('[data-slot=card]') as HTMLElement);
  expect(alice).toHaveTextContent('alice');
  expect(alice).toHaveTextContent('TOI');
  expect(alice).toHaveTextContent('Duo · 3 parties · 2 W · 1 L');
  // One defeat (5), no bonus, one forfeit won (−5): nothing to do.
  expect(alice).toHaveTextContent('mains propres');
  // Bob scored less than Alice in the defeat: 5 + 5 bonus − 5 dodged.
  expect(bob).toHaveTextContent('5pompes à faire');
  expect(bob).toHaveTextContent('Esquivées−5');
});

test('a forfeit won dodges nothing the days the club turned the −5 off', async () => {
  const rules = { ...board.rules, forfeit: [{ effectiveFrom: '2026-11-07', enabled: false }] };
  renderInApp(<MatchesPage />, { board: { ...board, rules }, path: today });
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
  renderInApp(<MatchesPage />, { board: { ...board, results: [...highScore, ...board.results] }, path: today });
  const summary = await screen.findByRole('region', { name: 'Bilan du jour' });
  const [alice] = within(summary)
    .getAllByText(/parties/)
    .map((line) => line.closest('[data-slot=card]') as HTMLElement);
  // Two defeats (10), one forfeit won (−5), one game from 1000 points (−10): nothing to do.
  expect(alice).toHaveTextContent('Duo · 4 parties · 2 W · 2 L');
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
    path: today,
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
  expect(alice).toHaveTextContent('Duo · 4 parties · 3 W · 1 L');
  expect(alice).toHaveTextContent('mains propres');
  // A defeat of 5 more, with no bonus nor the −10 of his 1100 points.
  expect(bob).toHaveTextContent('Duo · 4 parties · 2 W · 2 L');
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

test('replays the day by part of day, with how each match ended', async () => {
  renderInApp(<MatchesPage />, { board, path: today });
  const replay = await screen.findByRole('region', { name: 'Derniers matchs' });
  const labels = within(replay)
    .getAllByText(/^(Ce soir|Cet après-midi|Ce matin)$/)
    .map((label) => label.textContent);
  expect(labels).toEqual(['Ce soir', 'Cet après-midi']);
  expect(within(replay).getByText('21:40 · Prolongation')).toBeInTheDocument();
  expect(within(replay).getByText('21:28 · Les adversaires ont FF')).toBeInTheDocument();
  expect(within(replay).getAllByText('GG')).toHaveLength(2);
  expect(within(replay).getAllByText('AÏE')).toHaveLength(1);
});

test('a match played on a solo account shows its pseudo, and the summary says which accounts played', async () => {
  const aliceSolo = `Epic|${'A'.repeat(32)}|0`;
  const onSolo = (row: (typeof board.results)[number]) =>
    row.match_guid === 'evening-loss' && row.name === 'alice' ? { ...row, player_id: aliceSolo.toLowerCase() } : row;
  renderInApp(<MatchesPage />, {
    board: {
      ...board,
      results: board.results.map(onSolo),
      doublesRanks: [aRank({ player: 'alice', solo: aSoloRank({ pseudo: 'Alice Solo', playerId: aliceSolo }) })],
    },
    path: today,
  });
  const summary = await screen.findByRole('region', { name: 'Bilan du jour' });
  const [alice, bob] = within(summary)
    .getAllByText(/parties/)
    .map((line) => line.closest('[data-slot=card]') as HTMLElement);
  expect(alice).toHaveTextContent('Solo et Duo · 3 parties · 2 W · 1 L');
  expect(bob).toHaveTextContent('Duo · 3 parties');
  const replay = screen.getByRole('region', { name: 'Derniers matchs' });
  const [evening, ff] = within(replay)
    .getAllByText(/^(21:40|21:28)/)
    .map((line) => line.parentElement?.parentElement as HTMLElement);
  expect(evening).toHaveTextContent('Alice Solo');
  expect(evening).not.toHaveTextContent(/alice ·/);
  expect(ff).toHaveTextContent('alice · 400 pts');
});

test('goes back to an earlier day: its summary and its matches only', async () => {
  renderInApp(<MatchesPage />, { board, path: '/matchs?jour=2026-11-06' });
  const day = await screen.findByRole('navigation', { name: 'Jour affiché' });
  expect(within(day).getByRole('button', { name: 'Ven. 6 nov., choisir un jour' })).toBeInTheDocument();
  expect(within(day).getByRole('button', { name: 'Précédent' })).toBeDisabled();
  expect(within(day).getByRole('link', { name: 'Jour suivant' })).toHaveAttribute('href', '/matchs?jour=2026-11-07');
  const summary = screen.getByRole('region', { name: 'Bilan du jour' });
  expect(within(summary).getByRole('heading', { name: 'Les bras vont chauffer' })).toBeInTheDocument();
  expect(within(summary).getAllByText(/^1 partie/)).toHaveLength(2);
  expect(summary).toHaveTextContent('Duo · 1 partie · 0 W · 1 L');
  const replay = screen.getByRole('region', { name: 'Derniers matchs' });
  expect(within(replay).getByText('Les matchs du 6 nov.')).toBeInTheDocument();
  expect(within(replay).getByText('Le soir')).toBeInTheDocument();
  expect(within(replay).getAllByText('AÏE')).toHaveLength(1);
  expect(within(replay).queryByText('GG')).not.toBeInTheDocument();
});

test('sums up and replays the last seven days by default, day by day', async () => {
  renderInApp(<MatchesPage />, { board, path: '/matchs' });
  const period = await screen.findByRole('navigation', { name: 'Période affichée' });
  expect(within(period).getByRole('button', { name: '7 derniers jours, choisir un jour' })).toBeInTheDocument();
  const summary = screen.getByRole('region', { name: 'Bilan du jour' });
  expect(within(summary).getByText('Bilan · 7 jours')).toBeInTheDocument();
  expect(summary).toHaveTextContent('Duo · 4 parties · 2 W · 2 L');
  const replay = screen.getByRole('region', { name: 'Derniers matchs' });
  expect(within(replay).getByText('Les 7 derniers jours')).toBeInTheDocument();
  expect(
    within(replay)
      .getAllByText(/^(Aujourd’hui|Hier · .*)$/)
      .map((label) => label.textContent),
  ).toEqual(['Aujourd’hui', 'Hier · vendredi 6']);
});

test('a day chosen leads back to the seven days', async () => {
  renderInApp(<MatchesPage />, { board, path: '/matchs?jour=2026-11-06' });
  expect(await screen.findByRole('link', { name: 'Revenir aux 7 derniers jours' })).toHaveAttribute('href', '/matchs');
});

test('says when nobody played in seven days', async () => {
  renderInApp(<MatchesPage />, { board: boardWith() });
  expect(await screen.findByText('Aucun match en 7 jours. Le terrain attend son kickoff.')).toBeInTheDocument();
  expect(screen.getByText('Pas un match en 7 jours. Suspect.')).toBeInTheDocument();
});

test('keeps each match under its own day, even one received later', async () => {
  const late = duo('late-import', '2026-11-07T22:00:00Z', { won: true }).map((row) => ({ ...row, day: '2026-11-05' }));
  renderInApp(<MatchesPage />, {
    board: {
      ...board,
      results: [...board.results, ...late],
      matchRosters: [...board.matchRosters, { match_guid: 'late-import', expected_players: 4 }],
    },
    path: '/matchs',
  });
  const replay = await screen.findByRole('region', { name: 'Derniers matchs' });
  expect(
    within(replay)
      .getAllByText(/^(Aujourd’hui|Hier · .*|Jeudi 5 novembre)$/)
      .map((label) => label.textContent),
  ).toEqual(['Aujourd’hui', 'Hier · vendredi 6', 'Jeudi 5 novembre']);
});

test('a player in a group with a club player or the same stranger three matches in a row shows the group icon', async () => {
  /** Alice alone with a teammate the matchmaking gave her, against two other strangers. */
  const withMate = (guid: string, received: string, mate: string) => {
    const common = { match_guid: guid, received };
    return [
      aResult({ ...common, name: 'alice' }),
      aResult({ ...common, name: mate, player_id: `Epic|${mate}|0` }),
      aResult({ ...common, name: `${guid}-1`, player_id: `Epic|${guid}-1|0`, team: 1 }),
      aResult({ ...common, name: `${guid}-2`, player_id: `Epic|${guid}-2|0`, team: 1 }),
    ];
  };
  const results = [
    ...withMate('random', '2026-11-07T19:00:00Z', 'nice-guy'),
    ...withMate('again', '2026-11-07T19:10:00Z', 'nice-guy'),
    ...withMate('chance', '2026-11-07T19:20:00Z', 'other-guy'),
    ...withMate('chance-again', '2026-11-07T19:30:00Z', 'other-guy'),
    ...withMate('party-1', '2026-11-07T19:40:00Z', 'new-friend'),
    ...withMate('party-2', '2026-11-07T19:50:00Z', 'new-friend'),
    ...withMate('party-3', '2026-11-07T20:00:00Z', 'new-friend'),
    ...duo('with-bob', '2026-11-07T20:10:00Z', { won: true }),
  ];
  renderInApp(<MatchesPage />, { board: { ...board, results }, path: today });
  const replay = await screen.findByRole('region', { name: 'Derniers matchs' });
  const grouped = (clock: string) => {
    const match = within(replay).getByText(new RegExp(`^${clock}`)).parentElement?.parentElement as HTMLElement;
    return within(match).queryAllByRole('img', { name: 'En groupe' }).length;
  };
  // Alice and Bob, both of the club: a group at once.
  expect(grouped('21:10')).toBe(2);
  // Three matches in a row with the same stranger: a group from the second, the first met him by chance.
  expect(['21:00', '20:50', '20:40'].map(grouped)).toEqual([1, 1, 0]);
  // Twice in a row can be chance.
  expect(['20:30', '20:20', '20:10', '20:00'].map(grouped)).toEqual([0, 0, 0, 0]);
});

test('a discreet icon tells the kind of game of each match, when the game sent it', async () => {
  const played = (guid: string, received: string, playlist: number | null) =>
    duo(guid, received, { won: true }).map((row) => ({ ...row, playlist }));
  const kinds = boardWith({
    results: [
      ...played('casual', '2026-11-07T20:40:00Z', 2),
      ...played('ranked', '2026-11-07T20:30:00Z', 11),
      ...played('tournament', '2026-11-07T20:20:00Z', 34),
      ...played('before', '2026-11-07T20:10:00Z', null),
      ...played('private', '2026-11-07T20:00:00Z', 6),
    ],
  });
  renderInApp(<MatchesPage />, { board: kinds, path: today });
  const replay = await screen.findByRole('region', { name: 'Derniers matchs' });
  const kindOf = (label: string) =>
    ['Occasionnel', 'Compétitif', 'Tournoi', 'Match privé'].filter((kind) =>
      within(within(replay).getByText(label).closest('div') as HTMLElement).queryByRole('img', { name: kind }),
    );
  expect(['21:40', '21:30', '21:20', '21:10', '21:00'].map(kindOf)).toEqual([
    ['Occasionnel'],
    ['Compétitif'],
    ['Tournoi'],
    [],
    ['Match privé'],
  ]);
});

test('the replay names the MVP of each match the club won, beside their points', async () => {
  renderInApp(<MatchesPage />, { board, path: today });
  const replay = await screen.findByRole('region', { name: 'Derniers matchs' });
  // Alice had the best score of the winners twice today; the strangers won the evening's loss.
  expect(within(replay).getAllByText('MVP')).toHaveLength(2);
  expect(within(replay).getAllByText('MVP')[0]?.parentElement).toHaveTextContent('· 400 pts · MVP');
});
