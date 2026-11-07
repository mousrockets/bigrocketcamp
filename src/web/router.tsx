import { createRootRoute, createRoute, createRouter, type RouterHistory } from '@tanstack/react-router';
import { z } from '../lib/validation';
import { App, NotFound } from './app';
import { ChallengesPage } from './challenges/challenges-page';
import { Connections } from './connections';
import { MatchesPage } from './matches/matches-page';
import { Profile } from './profile';
import { Settings } from './settings';
import { AppShell } from './shell/app-shell';
import { TeamPage } from './team/team-page';

// The app's pages. The root (app.tsx) stands in front of all of them, the unknown addresses included:
// signing in first, then the club, then a new member's first visit. The tabs share the app shell.

const rootRoute = createRootRoute({ component: App, notFoundComponent: NotFound });

// `?declarer=true` opens the declaration sheet over whatever tab is open.
const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_shell',
  component: AppShell,
  validateSearch: z.object({ declarer: z.boolean().optional().catch(undefined) }),
});
const teamRoute = createRoute({ getParentRoute: () => shellRoute, path: '/', component: TeamPage });
const challengesRoute = createRoute({ getParentRoute: () => shellRoute, path: '/defis', component: ChallengesPage });
const matchesRoute = createRoute({ getParentRoute: () => shellRoute, path: '/matchs', component: MatchesPage });
const settingsRoute = createRoute({ getParentRoute: () => shellRoute, path: '/reglages', component: Settings });

const connectionsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/connexions', component: Connections });
const profileRoute = createRoute({ getParentRoute: () => rootRoute, path: '/profil', component: Profile });

export const routeTree = rootRoute.addChildren([
  shellRoute.addChildren([teamRoute, challengesRoute, matchesRoute, settingsRoute]),
  connectionsRoute,
  profileRoute,
]);

export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    ...(history && { history }),
    // An unknown address shows the root's 404, wherever it starts ("/profil/x" included).
    notFoundMode: 'root',
    // Moving between tabs and back puts the page where it was, as the browser did.
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
