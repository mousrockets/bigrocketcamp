import { createRootRoute, createRoute, createRouter, Navigate, type RouterHistory } from '@tanstack/react-router';
import { App, NotFound } from './app';
import { ChallengePage } from './pages/challenge';
import { ClubPage } from './pages/club';
import { DirectPage } from './pages/direct';
import { DrinksPage } from './pages/drinks';
import { ExercisesPage } from './pages/exercises';
import { IdentitiesPage } from './pages/identities';
import { MatchesPage, type MatchesSearch } from './pages/matches';
import { MembersPage } from './pages/members';
import { PlayerPage } from './pages/player';
import { PodiumPage } from './pages/podium';
import { ProfilePage } from './pages/profile';
import { RecapPage } from './pages/recap';
import { SettingsPage } from './pages/settings';

// The app's pages. The root (app.tsx) stands in front of all of them, the unknown addresses included:
// signing in first, then the club, then a new member's welcome.

const rootRoute = createRootRoute({ component: App, notFoundComponent: NotFound });

const route = <Path extends string>(path: Path, component: () => React.ReactNode) =>
  createRoute({ getParentRoute: () => rootRoute, path, component });

/** The period and the bot tests of the matches page live in its address, so Back and a reload keep them. */
const matchesSearch = (search: Record<string, unknown>): MatchesSearch => ({
  ...(typeof search.jour === 'string' && { jour: search.jour }),
  ...(search.tests === true && { tests: true }),
});

const AllMatches = () => <MatchesPage />;
const OneMatch = () => <MatchesPage guid={matchRoute.useParams().guid} />;
const OnePlayer = () => <PlayerPage position={playerRoute.useParams().position} />;
// The old board's address, from bookmarks: its sections now live on the club's pages.
const OldBoard = () => <Navigate to="/" replace />;

const clubRoute = route('/', ClubPage);
const oldBoardRoute = route('/tableau', OldBoard);
const recapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recap',
  validateSearch: (search: Record<string, unknown>): { jour?: string } =>
    typeof search.jour === 'string' ? { jour: search.jour } : {},
  component: RecapPage,
});
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
const exercisesRoute = route('/exercices', ExercisesPage);
const challengeRoute = route('/defi', ChallengePage);
const drinksRoute = route('/defi/bilans', DrinksPage);
const podiumRoute = route('/defi/podium', PodiumPage);
/** A player by their place in the roster (1 for the first to join): no pseudo in the address. */
const playerRoute = createRoute({ getParentRoute: () => rootRoute, path: '/joueurs/$position', component: OnePlayer });
const profileRoute = route('/profil', ProfilePage);
const settingsRoute = route('/reglages', SettingsPage);
const membersRoute = route('/reglages/membres', MembersPage);
const connectionsRoute = route('/connexions', IdentitiesPage);
// "/direct/" opens it too: an address matches with or without its final slash, and keeps it.
const directRoute = route('/direct', DirectPage);

export const routeTree = rootRoute.addChildren([
  clubRoute,
  oldBoardRoute,
  recapRoute,
  matchesRoute,
  matchRoute,
  exercisesRoute,
  challengeRoute,
  drinksRoute,
  podiumRoute,
  playerRoute,
  profileRoute,
  settingsRoute,
  membersRoute,
  connectionsRoute,
  directRoute,
]);

export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    ...(history && { history }),
    // An unknown address shows the root's 404, wherever it starts ("/direct/autre" included).
    notFoundMode: 'root',
    // Back and forward put each page where it was.
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
