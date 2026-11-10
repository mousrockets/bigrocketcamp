import { QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type { Window as HappyWindow } from 'happy-dom';
import type { ReactNode } from 'react';
import { boardView, emptyBoard } from '../lib/board-sync';
import { type Board, BoardContext } from './board';
import { type Club, ClubContext, ClubLogoContext, ClubNameContext } from './club';
import { createQueryClient } from './query-client';

// Renders a piece of the app as a signed-in member sees it: with its club, its board and a router, so that links
// and the active tab work. Each test describes only what it needs; the rest is a small fictional club.

export const testClub: Club = {
  name: 'Big Rocket Camp',
  logo: null,
  players: [
    { slot: 'alice', platform: 'pc' },
    { slot: 'bob', platform: 'playstation' },
  ],
  roster: ['alice', 'bob'],
  me: {
    id: 'member-alice',
    email: 'alice@example.com',
    role: 'admin',
    duoPseudo: 'alice',
    soloPseudo: null,
    platform: 'pc',
    duoPseudoLocked: false,
  },
};

type BoardResult = Board['results'][number];
type BoardExercise = Board['exercises'][number];
type DoublesRank = Board['doublesRanks'][number];

/** A board as the app shows it, with nothing played nor done, then the parts a test gives. */
export const boardWith = (parts: Partial<Board> = {}, club: Club = testClub): Board => ({
  ...boardView(emptyBoard(), club.roster),
  ...parts,
});

/** A player's line of a 2v2 match, lost unless the test says otherwise. */
export const aResult = (parts: Partial<BoardResult> & Pick<BoardResult, 'name' | 'match_guid'>): BoardResult => ({
  player_id: `Epic|${parts.name}|0`,
  day: '2026-11-07',
  kind: 'match',
  team: 0,
  winner: 1,
  score: 300,
  goals: 0,
  assists: 0,
  saves: 0,
  demos: null,
  crossbar_hits: null,
  received: '2026-11-07T18:00:00.000Z',
  review_required: false,
  verification: 'single',
  source_types: ['collector'],
  selected_source: 'collector',
  source_difference: null,
  forfeit: null,
  overtime: null,
  left: false,
  blue_goals: null,
  orange_goals: null,
  ...parts,
});

/** A series of pushups declared by the member, unless the test says otherwise. */
export const anExercise = (parts: Partial<BoardExercise> & Pick<BoardExercise, 'id' | 'player'>): BoardExercise => ({
  type: 'pushups',
  count: 10,
  day: '2026-11-07',
  created: '2026-11-07T18:00:00.000Z',
  mine: true,
  ...parts,
});

/** A player's ranks as the rank source last read them. */
export const aRank = (parts: Partial<DoublesRank> & Pick<DoublesRank, 'player'>): DoublesRank => ({
  mmr: null,
  label: 'Rang non renseigné',
  tier: null,
  matchesPlayed: null,
  placements: null,
  status: 'ready',
  fetchedAt: null,
  lastAttempt: null,
  peak: null,
  solo: null,
  ...parts,
});

/** A solo account as the rank source read it. */
export const aSoloRank = (parts: Partial<SoloRank> = {}): SoloRank => ({
  mmr: null,
  label: '',
  tier: null,
  matchesPlayed: null,
  placements: null,
  fetchedAt: null,
  peak: null,
  status: 'ready',
  pseudo: null,
  best: null,
  playerId: null,
  ...parts,
});

type SoloRank = NonNullable<DoublesRank['solo']>;

interface Options {
  club?: Club;
  board?: Board | null;
  boardError?: string;
  /** The address the page is shown at. */
  path?: string;
}

export function renderInApp(
  ui: ReactNode,
  { club = testClub, board = boardWith({}, club), boardError = '', path = '/' }: Options = {},
) {
  const page = () => (
    <ClubNameContext value={club.name}>
      <ClubLogoContext value={club.logo}>
        <ClubContext value={club}>
          <BoardContext value={{ board, error: boardError, refresh: async () => board }}>{ui}</BoardContext>
        </ClubContext>
      </ClubLogoContext>
    </ClubNameContext>
  );
  const root = createRootRoute({ component: Outlet });
  // Every address the app links to exists, so that a link knows whether it is the current page.
  const routes = [
    '/',
    '/defis',
    '/matchs',
    '/declarer',
    '/reglages',
    '/reglages/compte',
    '/reglages/collecteur',
    '/reglages/identites',
    '/reglages/club',
    '/reglages/membres',
  ].map((routePath) => createRoute({ getParentRoute: () => root, path: routePath, component: page }));
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
    // As in the app: a new page starts at the top, unless the navigation says otherwise.
    scrollRestoration: true,
  });
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** Lays the page out at a width, as a phone (390) or a computer (1440) would; happy-dom starts at 1024. */
export const setViewportWidth = (width: number) =>
  (window as unknown as HappyWindow).happyDOM.setViewport({ width, height: width < 1024 ? 844 : 900 });
