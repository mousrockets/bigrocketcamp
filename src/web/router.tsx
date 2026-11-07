import { createRootRoute, createRoute, createRouter, type RouterHistory } from '@tanstack/react-router';
import type { ComponentType } from 'react';
import { App, NotFound } from './app';
import { Connections } from './connections';
import { Dashboard } from './dashboard';
import { Direct } from './direct';
import { ChallengePage } from './pages/challenge';
import { ClubPage } from './pages/club';
import { DrinksPage } from './pages/drinks';
import { ExercisesPage } from './pages/exercises';
import { MatchesPage, type MatchesSearch } from './pages/matches';
import { PodiumPage } from './pages/podium';
import { RecapPage } from './pages/recap';
import { Profile } from './profile';
import { Settings } from './settings';

// The app's pages. The root (app.tsx) stands in front of all of them, the unknown addresses included:
// signing in first, then the club, then a new member's profile.

const rootRoute = createRootRoute({ component: App, notFoundComponent: NotFound });

/** A page not redesigned yet keeps its old styles, which apply inside this wrapper only (legacy.css). */
function Legacy({ page: Page }: { page: ComponentType }) {
  return (
    <div className="legacy">
      <Page />
    </div>
  );
}

const LegacyDashboard = () => <Legacy page={Dashboard} />;
const LegacyDirect = () => <Legacy page={Direct} />;
const LegacyConnections = () => <Legacy page={Connections} />;
const LegacyProfile = () => <Legacy page={Profile} />;
const LegacySettings = () => <Legacy page={Settings} />;

// New addresses whose page is not built yet: the board section that holds them for now.

const clubRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: ClubPage });
// The old board, while its last sections (matches, challenge, player cards) move to their own pages.
const boardRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tableau', component: LegacyDashboard });
const recapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recap',
  validateSearch: (search: Record<string, unknown>): { jour?: string } =>
    typeof search.jour === 'string' ? { jour: search.jour } : {},
  component: RecapPage,
});
/** The period and the bot tests of the matches page live in its address, so Back and a reload keep them. */
const matchesSearch = (search: Record<string, unknown>): MatchesSearch => ({
  ...(typeof search.jour === 'string' && { jour: search.jour }),
  ...(search.tests === true && { tests: true }),
});
const AllMatches = () => <MatchesPage />;
const OneMatch = () => <MatchesPage guid={matchRoute.useParams().guid} />;
const matchesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/matchs',
  validateSearch: matchesSearch,
  component: AllMatches,
});
const matchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/matchs/$guid',
  validateSearch: matchesSearch,
  component: OneMatch,
});
const exercisesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/exercices', component: ExercisesPage });
const challengeRoute = createRoute({ getParentRoute: () => rootRoute, path: '/defi', component: ChallengePage });
const drinksRoute = createRoute({ getParentRoute: () => rootRoute, path: '/defi/bilans', component: DrinksPage });
const podiumRoute = createRoute({ getParentRoute: () => rootRoute, path: '/defi/podium', component: PodiumPage });
// "/direct/" opens it too: an address matches with or without its final slash, and keeps it.
const directRoute = createRoute({ getParentRoute: () => rootRoute, path: '/direct', component: LegacyDirect });
const connectionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/connexions',
  component: LegacyConnections,
});
const profileRoute = createRoute({ getParentRoute: () => rootRoute, path: '/profil', component: LegacyProfile });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/reglages', component: LegacySettings });

export const routeTree = rootRoute.addChildren([
  clubRoute,
  boardRoute,
  recapRoute,
  matchesRoute,
  matchRoute,
  exercisesRoute,
  challengeRoute,
  drinksRoute,
  podiumRoute,
  directRoute,
  connectionsRoute,
  profileRoute,
  settingsRoute,
]);

export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    ...(history && { history }),
    // An unknown address shows the root's 404, wherever it starts ("/direct/autre" included).
    notFoundMode: 'root',
    // Moving within the board (#exercise, #monthly-mmr…) and back puts the page where it was, as the browser did.
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
