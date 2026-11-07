import { createRootRoute, createRoute, createRouter, type RouterHistory } from '@tanstack/react-router';
import { App, NotFound } from './app';
import { Connections } from './connections';
import { Dashboard } from './dashboard';
import { Direct } from './direct';
import { Profile } from './profile';
import { Settings } from './settings';

// The app's pages. The root (app.tsx) stands in front of all of them, the unknown addresses included:
// signing in first, then the club, then a new member's profile.

const rootRoute = createRootRoute({ component: App, notFoundComponent: NotFound });

const boardRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Dashboard });
// "/direct/" opens it too: an address matches with or without its final slash, and keeps it.
const directRoute = createRoute({ getParentRoute: () => rootRoute, path: '/direct', component: Direct });
const connectionsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/connexions', component: Connections });
export const profileRoute = createRoute({ getParentRoute: () => rootRoute, path: '/profil', component: Profile });
const settingsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/reglages', component: Settings });

export const routeTree = rootRoute.addChildren([
  boardRoute,
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
