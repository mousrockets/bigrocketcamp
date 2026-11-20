import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { anExercise, renderInApp } from '../test-utils';
import { ChallengesPage } from './challenges-page';
import { octoberBoard, recapClub } from './recap-fixture';
import { MonthlyRecap } from './recap-story';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-07T15:00:00Z'));
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** This device already showed October to the member: nothing opens by itself. */
const octoberSeen = () => localStorage.setItem('rl-recap', JSON.stringify({ 'member-alice': '2026-10' }));

const showRecap = (path = '/defis?recap=2026-10', board = octoberBoard) =>
  renderInApp(<MonthlyRecap />, { club: recapClub, board, path });

const slide = () => screen.getByRole('region', { name: /sur/ });
const next = () => userEvent.click(screen.getByRole('button', { name: 'Slide suivante' }));

test('tells October slide by slide: the club, the arms, the streaks, the climb, the stats, the member', async () => {
  octoberSeen();
  showRecap();
  const story = await screen.findByRole('dialog', { name: 'Récap d’octobre' });
  expect(within(story).getByRole('region', { name: '1 sur 8' })).toHaveTextContent('Ton mois d’octobre');

  await next();
  expect(slide()).toHaveAccessibleName('2 sur 8');
  expect(slide()).toHaveTextContent('Le club d’octobre');
  expect(slide()).toHaveTextContent('5matchs joués');
  expect(slide()).toHaveTextContent('3 victoires · 2 défaites');
  expect(slide()).toHaveTextContent('70 pompes rendues');

  await next();
  expect(slide()).toHaveTextContent('Les bras d’or d’octobre');
  expect(slide()).toHaveTextContent('alice');
  expect(slide()).toHaveTextContent('40pompes');
  expect(slide()).toHaveTextContent('Plus grosse ardoise : bob, 5 pompes à rendre. On croit fort en toi.');

  await next();
  expect(slide()).toHaveTextContent('La plus belle streak');
  expect(slide()).toHaveTextContent('2victoires d’affilée');
  expect(slide()).toHaveTextContent('Série noire : alice, 2 défaites de suite.');

  await next();
  expect(slide()).toHaveTextContent('+80MMR gagnés au défi du mois');
  expect(within(slide()).getByRole('img', { name: 'Rank Champion III' })).toHaveAttribute(
    'src',
    '/rocket-league/ranks/18.png',
  );
  expect(within(slide()).getByRole('img', { name: 'Rank Grand Champion I' })).toHaveAttribute(
    'src',
    '/rocket-league/ranks/19.png',
  );
  expect(slide()).toHaveTextContent('Dernier du défi : carol. Tournée générale !');
  expect(slide()).toHaveTextContent('n’a pas l’approbation d’Epic Games');

  await next();
  expect(slide()).toHaveTextContent('3démos');
  expect(slide()).toHaveTextContent('1 barre transversale · 1 prolongation · 1 FF');

  await next();
  expect(slide()).toHaveTextContent('Ton mois à toi');
  expect(slide()).toHaveTextContent('40pompes rendues');
  expect(slide()).toHaveTextContent('3 matchs · 1 victoire · 0 but');
  expect(slide()).toHaveTextContent('Premier du club aux pompes.');

  await next();
  expect(slide()).toHaveAccessibleName('8 sur 8');
  expect(slide()).toHaveTextContent('GG');
  await userEvent.click(within(slide()).getByRole('button', { name: 'Revoir le récap' }));
  expect(slide()).toHaveAccessibleName('1 sur 8');
});

test('names every leader of a tie, each in their colour', async () => {
  octoberSeen();
  const tied = {
    ...octoberBoard,
    exercises: [
      ...octoberBoard.exercises,
      anExercise({ id: 'exercise-0000000004', player: 'bob', count: 40, day: '2026-10-09' }),
    ],
  };
  showRecap('/defis?recap=2026-10', tied);
  await screen.findByRole('dialog');
  await next();
  await next();
  expect(slide()).toHaveTextContent('alice & bob');
  expect(slide()).toHaveTextContent('À égalité parfaite.');
});

test('a quiet month says so in three slides', async () => {
  octoberSeen();
  showRecap('/defis?recap=2026-09');
  await screen.findByRole('dialog', { name: 'Récap de septembre' });
  await next();
  expect(slide()).toHaveAccessibleName('2 sur 3');
  expect(slide()).toHaveTextContent('Zéro match, zéro pompe. Les vacances, c’est sacré.');
});

test('moves with the arrow keys, and closes with Escape or its button', async () => {
  octoberSeen();
  const user = userEvent.setup();
  showRecap();
  await screen.findByRole('dialog');
  await user.keyboard('{ArrowRight}');
  expect(slide()).toHaveAccessibleName('2 sur 8');
  await user.keyboard('{ArrowLeft}');
  expect(slide()).toHaveAccessibleName('1 sur 8');
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('a press held pauses the story, and the slide stays', async () => {
  octoberSeen();
  showRecap();
  await screen.findByRole('dialog');
  const right = screen.getByRole('button', { name: 'Slide suivante' });
  fireEvent.pointerDown(right, { button: 0, clientX: 300, clientY: 400 });
  expect(await screen.findByRole('button', { name: 'Reprendre' }, { timeout: 1000 })).toBeInTheDocument();
  fireEvent.pointerUp(right, { button: 0, clientX: 300, clientY: 400 });
  fireEvent.click(right);
  expect(screen.getByRole('button', { name: 'Mettre en pause' })).toBeInTheDocument();
  expect(slide()).toHaveAccessibleName('1 sur 8');
  await userEvent.click(screen.getByRole('button', { name: 'Mettre en pause' }));
  expect(screen.getByRole('button', { name: 'Reprendre' })).toBeInTheDocument();
});

test('a swipe down closes it', async () => {
  octoberSeen();
  showRecap();
  await screen.findByRole('dialog');
  const right = screen.getByRole('button', { name: 'Slide suivante' });
  fireEvent.pointerDown(right, { button: 0, clientX: 200, clientY: 200 });
  fireEvent.pointerMove(right, { clientX: 205, clientY: 400 });
  fireEvent.pointerUp(right, { clientX: 205, clientY: 400 });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('opens by itself once a new month starts, then never again on this device', async () => {
  const first = showRecap('/');
  expect(await screen.findByRole('dialog', { name: 'Récap d’octobre' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Fermer le récap' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  first.unmount();

  showRecap('/');
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('does not open by itself when last month has nothing to tell', async () => {
  vi.setSystemTime(new Date('2026-12-07T15:00:00Z'));
  showRecap('/', { ...octoberBoard, results: [], exercises: [] });
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('replays any month gone by from Défis', async () => {
  octoberSeen();
  renderInApp(
    <>
      <ChallengesPage />
      <MonthlyRecap />
    </>,
    { club: recapClub, board: octoberBoard, path: '/defis' },
  );
  const recaps = await screen.findByRole('list', { name: 'Récaps des mois passés' });
  expect(
    within(recaps)
      .getAllByRole('listitem')
      .map((item) => item.textContent),
  ).toEqual(['Octobre 20265 matchs · 70 pompes']);
  await userEvent.click(within(recaps).getByRole('link', { name: /Octobre 2026/ }));
  expect(await screen.findByRole('dialog', { name: 'Récap d’octobre' })).toBeInTheDocument();
});

test('counts the big number up, from zero', async () => {
  octoberSeen();
  showRecap();
  await screen.findByRole('dialog');
  await next();
  expect(within(slide()).getByText('0')).toBeInTheDocument();
  await waitFor(() => expect(within(slide()).queryByText('0')).not.toBeInTheDocument(), { timeout: 3000 });
});

test('with reduced motion, shows the same figures at once', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  octoberSeen();
  showRecap();
  await screen.findByRole('dialog');
  await next();
  expect(within(slide()).queryByText('0')).not.toBeInTheDocument();
  expect(within(slide()).getByText('5')).toBeInTheDocument();
  expect(slide()).toHaveTextContent('3 victoires · 2 défaites');
});
