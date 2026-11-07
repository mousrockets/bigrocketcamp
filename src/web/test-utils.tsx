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
import type { ReactNode } from 'react';
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

export const emptyBoard: Board = { results: [], exercises: [], collectors: [] };

interface Options {
  club?: Club;
  board?: Board | null;
  boardError?: string;
  /** The address the page is shown at. */
  path?: string;
}

export function renderInApp(
  ui: ReactNode,
  { club = testClub, board = emptyBoard, boardError = '', path = '/' }: Options = {},
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
  const routes = ['/', '/defis', '/matchs', '/reglages', '/declarer'].map((routePath) =>
    createRoute({ getParentRoute: () => root, path: routePath, component: page }),
  );
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
