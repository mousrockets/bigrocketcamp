import { createRootRoute, createRoute, createRouter, type RouterHistory } from '@tanstack/react-router';
import { App, NotFound } from './app';
import { Connections } from './connections';
import { Dashboard } from './dashboard';
import { Direct } from './direct';
import { Profile } from './profile';
import { Settings } from './settings';
import { AppShell } from './shell/app-shell';
import { TeamPage } from './team/team-page';

// The app's pages. The root (app.tsx) stands in front of all of them, the unknown addresses included:
// signing in first, then the club, then a new member's first visit. The tabs share the app shell.

const rootRoute = createRootRoute({ component: App, notFoundComponent: NotFound });

const shellRoute = createRoute({ getParentRoute: () => rootRoute, id: '_shell', component: AppShell });
const teamRoute = createRoute({ getParentRoute: () => shellRoute, path: '/', component: TeamPage });
// Until their own step of the redesign, Défis, Matchs and Déclarer open the former board, which has all three.
const challengesRoute = createRoute({ getParentRoute: () => shellRoute, path: '/defis', component: Dashboard });
const matchesRoute = createRoute({ getParentRoute: () => shellRoute, path: '/matchs', component: Dashboard });
const declareRoute = createRoute({ getParentRoute: () => shellRoute, path: '/declarer', component: Dashboard });
const settingsRoute = createRoute({ getParentRoute: () => shellRoute, path: '/reglages', component: Settings });

// "/direct/" opens it too: an address matches with or without its final slash, and keeps it.
const directRoute = createRoute({ getParentRoute: () => rootRoute, path: '/direct', component: Direct });
const connectionsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/connexions', component: Connections });
const profileRoute = createRoute({ getParentRoute: () => rootRoute, path: '/profil', component: Profile });

export const routeTree = rootRoute.addChildren([
  shellRoute.addChildren([teamRoute, challengesRoute, matchesRoute, declareRoute, settingsRoute]),
  directRoute,
  connectionsRoute,
  profileRoute,
]);

export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    ...(history && { history }),
    // An unknown address shows the root's 404, wherever it starts ("/direct/autre" included).
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
