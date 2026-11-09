import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Board } from '../board';
import { anExercise, aRank, boardWith, renderInApp, testClub } from '../test-utils';
import { ChallengesPage } from './challenges-page';

const now = new Date('2026-11-07T15:15:30Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const club = {
  ...testClub,
  players: [...testClub.players, { slot: 'carol', platform: 'xbox' as const }],
  roster: ['alice', 'bob', 'carol'],
};

type Monthly = NonNullable<Board['monthly']>;
type Row = Monthly['current']['rows'][number];

/** November's standings as the API ranks them, best first. */
const november = (rows: Row[], debts: Monthly['debts'] = []): Monthly => ({
  startsMonth: '2026-10',
  current: {
    month: '2026-11',
    startAt: '2026-10-31T23:00:00.000Z',
    lastDay: '2026-11-30',
    lastDayStartAt: '2026-11-29T23:00:00.000Z',
    cutoffAt: '2026-11-30T23:00:00.000Z',
    rows,
    status: 'live',
    missing: rows.map((row) => row.player),
  },
  closed: [],
  allowedPlayers: ['alice'],
  debts,
});
const aRow = (player: string, mmr: number | null, account: Row['account']): Row => ({
  player,
  mmr,
  account,
  recordedAt: mmr === null ? null : '2026-11-07T10:00:00.000Z',
  confirmedForClose: false,
});

const ranks = [
  aRank({
    player: 'alice',
    mmr: 1480,
    label: 'Champion III · Division III',
    tier: 18,
    solo: {
      mmr: 1509,
      label: 'Grand Champion I · Division I',
      tier: 19,
      matchesPlayed: null,
      fetchedAt: null,
      peak: null,
      pseudo: null,
      best: null,
      status: 'ready',
    },
  }),
  aRank({ player: 'bob', mmr: 1238, label: 'Champion II · Division II', tier: 17 }),
  aRank({ player: 'carol', mmr: 1203, label: 'Champion II · Division I', tier: 17 }),
];

const board = boardWith(
  {
    exercises: [
      anExercise({ id: 'exercise-0000000001', player: 'alice', count: 195, day: '2026-11-03' }),
      anExercise({ id: 'exercise-0000000002', player: 'bob', count: 140, day: '2026-11-05' }),
      anExercise({ id: 'exercise-0000000003', player: 'carol', type: 'crunches', count: 160, day: '2026-11-06' }),
    ],
    doublesRanks: ranks,
    monthly: november([aRow('alice', 1509, 'solo'), aRow('bob', 1238, 'duo'), aRow('carol', 1203, 'duo')]),
  },
  club,
);

test('shows the week’s podium in rank order, the member marked', async () => {
  renderInApp(<ChallengesPage />, { club, board });
  const podium = await screen.findByRole('region', { name: 'Podium de la semaine' });
  const steps = within(podium).getAllByRole('listitem');
  expect(steps.map((step) => step.textContent)).toEqual([
    'aliceTOI195pompesPlace 1',
    'bob140pompesPlace 2',
    'carol80pompesPlace 3',
  ]);
});

test('shows an empty podium while nobody has done anything this week', async () => {
  renderInApp(<ChallengesPage />, { club, board: { ...board, exercises: [] } });
  const podium = await screen.findByRole('region', { name: 'Podium de la semaine' });
  expect(
    within(podium)
      .getAllByRole('listitem')
      .map((step) => step.textContent),
  ).toEqual(['—Place 1 : personne', '—Place 2 : personne', '—Place 3 : personne']);
  expect(within(podium).getByText(/Personne n’a encore sué cette semaine/)).toBeInTheDocument();
});

test('leaves a step empty when fewer players did something', async () => {
  const lone = {
    ...board,
    exercises: [anExercise({ id: 'exercise-0000000001', player: 'bob', count: 20, day: '2026-11-04' })],
  };
  renderInApp(<ChallengesPage />, { club, board: lone });
  const podium = await screen.findByRole('region', { name: 'Podium de la semaine' });
  expect(
    within(podium)
      .getAllByRole('listitem')
      .map((step) => step.textContent),
  ).toEqual(['bob20pompesPlace 1', '—Place 2 : personne', '—Place 3 : personne']);
});

test('goes back to the weeks before, down to the first exercise, and forward to this one', async () => {
  const user = userEvent.setup();
  const history = {
    ...board,
    exercises: [
      ...board.exercises,
      anExercise({ id: 'exercise-0000000004', player: 'carol', count: 30, day: '2026-10-28' }),
    ],
  };
  renderInApp(<ChallengesPage />, { club, board: history, path: '/defis' });
  const podium = await screen.findByRole('region', { name: 'Podium de la semaine' });
  const week = within(podium).getByRole('navigation', { name: 'Semaine affichée' });
  expect(week).toHaveTextContent('Cette semaine');
  expect(within(week).getByRole('button', { name: 'Suivant' })).toBeDisabled();
  await user.click(within(week).getByRole('link', { name: 'Semaine précédente' }));
  expect(await within(week).findByRole('link', { name: '26 oct. – 1 nov., revenir à cette semaine' })).toHaveAttribute(
    'href',
    '/defis',
  );
  expect(within(podium).getAllByRole('listitem')[0]).toHaveTextContent('carol30pompesPlace 1');
  expect(within(week).getByRole('button', { name: 'Précédent' })).toBeDisabled();
  expect(within(week).getByRole('link', { name: 'Semaine suivante' })).toHaveAttribute('href', '/defis');
});

test('counts down to the month’s close', async () => {
  renderInApp(<ChallengesPage />, { club, board });
  expect(await screen.findByRole('timer', { name: 'Clôture dans 23 jours, 7 heures et 44 minutes' })).toHaveTextContent(
    '23jours07heures44min',
  );
  expect(screen.getByRole('navigation', { name: 'Mois affiché' })).toHaveTextContent('Novembre');
  expect(screen.getByRole('heading', { name: 'Qui paie sa tournée ?' })).toBeInTheDocument();
});

test('goes back to a closed month as it closed: its standings and who was last', async () => {
  const october = {
    month: '2026-10',
    lastDay: '2026-10-31',
    cutoffAt: '2026-10-31T23:00:00.000Z',
    closedAt: '2026-10-31T23:05:00.000Z',
    rows: [aRow('bob', 1250, 'duo'), aRow('alice', 1180, 'solo'), aRow('carol', 1100, 'duo')],
    status: 'final' as const,
    missing: [],
    losers: ['carol'],
  };
  const withOctober = { ...board, monthly: { ...november([aRow('alice', 1509, 'solo')]), closed: [october] } };
  renderInApp(<ChallengesPage />, { club, board: withOctober, path: '/defis?mois=2026-10' });
  const month = await screen.findByRole('region', { name: 'Défi du mois' });
  expect(within(month).getByRole('navigation', { name: 'Mois affiché' })).toHaveTextContent('Oct. 2026');
  expect(within(month).getByRole('heading', { name: 'Le verdict d’octobre' })).toBeInTheDocument();
  expect(within(month).getByText('Mois clos, MMR relevés le 31 octobre.')).toBeInTheDocument();
  expect(within(month).queryByRole('timer')).not.toBeInTheDocument();
  const lines = within(within(month).getByRole('list', { name: 'Classement du mois' })).getAllByRole('listitem');
  expect(lines.map((line) => line.textContent)).toEqual([
    '1bobDuo · Champion II1\u00a0250',
    '2aliceTOISolo · Champion I1\u00a0180',
    '3carolDuo · Champion I1\u00a0100Dernier du mois2 boissons',
  ]);
  expect(within(month).getByRole('link', { name: 'Mois suivant' })).toHaveAttribute('href', '/defis');
});

test('ranks the month with the account that counted, and the last one pays a drink to each other', async () => {
  renderInApp(<ChallengesPage />, { club, board });
  const standings = await screen.findByRole('list', { name: 'Classement du mois' });
  const [first, second, last] = within(standings).getAllByRole('listitem');
  expect(first).toHaveTextContent('alice');
  expect(first).toHaveTextContent('TOI');
  expect(first).toHaveTextContent('Solo · Grand Champion I');
  expect(within(first as HTMLElement).getByRole('img', { name: 'Icône de rank Grand Champion I' })).toHaveAttribute(
    'src',
    '/rocket-league/ranks/19.png',
  );
  expect(first).toHaveTextContent('1 509');
  expect(second).toHaveTextContent('Duo · Champion II');
  expect(second).not.toHaveTextContent('Paie ta tournée');
  expect(last).toHaveTextContent('carol');
  expect(last).toHaveTextContent('Paie ta tournée !');
  expect(last).toHaveTextContent('2 boissons');
});

test('nobody pays while two players share the last place', async () => {
  const tied = november([aRow('alice', 1509, 'solo'), aRow('bob', 1203, 'duo'), aRow('carol', 1203, 'duo')]);
  renderInApp(<ChallengesPage />, { club, board: { ...board, monthly: tied } });
  const standings = await screen.findByRole('list', { name: 'Classement du mois' });
  expect(
    within(standings)
      .getAllByRole('listitem')
      .map((row) => row.textContent?.slice(0, 1)),
  ).toEqual(['1', '2', '2']);
  expect(screen.queryByText('Paie ta tournée !')).not.toBeInTheDocument();
});

test('lists the drinks still owed by a closed month, which the member marks offered', async () => {
  const fetch = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal('fetch', fetch);
  const debt = {
    id: '2026-10:bob:alice',
    month: '2026-10',
    payer: 'bob',
    recipient: 'alice',
    paidAt: null,
    canSettle: true,
    canUndo: false,
  };
  const settled = {
    ...debt,
    id: '2026-10:bob:carol',
    recipient: 'carol',
    paidAt: '2026-11-01T10:00:00Z',
    canSettle: true,
  };
  renderInApp(<ChallengesPage />, {
    club,
    board: { ...board, monthly: november(board.monthly?.current.rows ?? [], [debt, settled]) },
  });
  const debts = await screen.findByRole('list', { name: 'Tournées à offrir' });
  // A drink offered long ago has nothing left to do.
  expect(within(debts).getAllByRole('listitem')).toHaveLength(1);
  expect(within(debts).getByText('bob → alice')).toBeInTheDocument();
  expect(within(debts).getByText('1 boisson · défi d’octobre')).toBeInTheDocument();
  await userEvent.click(within(debts).getByRole('button', { name: 'Boisson offerte' }));
  expect(fetch).toHaveBeenCalledOnce();
});

test('shows no drinks block while nothing is owed', async () => {
  renderInApp(<ChallengesPage />, { club, board });
  await screen.findByRole('list', { name: 'Classement du mois' });
  expect(screen.queryByRole('list', { name: 'Tournées à offrir' })).not.toBeInTheDocument();
});
