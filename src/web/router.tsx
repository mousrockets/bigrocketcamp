import { createRootRoute, createRoute, createRouter, type RouterHistory, redirect } from '@tanstack/react-router';
import { z } from '../lib/validation';
import { App, NotFound } from './app';
import { ChallengesPage } from './challenges/challenges-page';
import { MatchesPage } from './matches/matches-page';
import { AccountSettings } from './settings/account';
import { ClubSettings } from './settings/club-info';
import { CollectorSettings } from './settings/collector';
import { IdentitiesSettings } from './settings/identities';
import { MembersSettings } from './settings/members';
import { SettingsHome } from './settings/settings-home';
import { AppShell } from './shell/app-shell';
import { TeamPage } from './team/team-page';

// The app's pages. The root (app.tsx) stands in front of all of them, the unknown addresses included:
// signing in first, then the club, then a new member's first visit. The tabs share the app shell.

const rootRoute = createRootRoute({ component: App, notFoundComponent: NotFound });

// `?declarer=true` opens the declaration sheet over whatever tab is open, `?ranks=true` the ranks' ladder,
// `?regles=true` the club's rules.
const sheetParameter = z.boolean().optional().catch(undefined);
const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_shell',
  component: AppShell,
  validateSearch: z.object({ declarer: sheetParameter, ranks: sheetParameter, regles: sheetParameter }),
});
const teamRoute = createRoute({ getParentRoute: () => shellRoute, path: '/', component: TeamPage });
// A past period has its own address: `?semaine=2026-11-02` (its Monday) and `?mois=2026-10` in Défis,
// `?jour=2026-11-07` in Matchs. Without one, or with one that cannot be read, the tab shows the current period.
const dayParameter = z.iso.date().optional().catch(undefined);
const monthParameter = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .optional()
  .catch(undefined);
const challengesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/defis',
  component: ChallengesPage,
  validateSearch: z.object({ semaine: dayParameter, mois: monthParameter }),
});
const matchesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/matchs',
  component: MatchesPage,
  validateSearch: z.object({ jour: dayParameter }),
});
const settingsRoute = createRoute({ getParentRoute: () => shellRoute, path: '/reglages', component: SettingsHome });
// Réglages opens its screens like iOS Settings, each with the way back to it.
const settingsScreens = (
  [
    ['/reglages/compte', AccountSettings],
    ['/reglages/collecteur', CollectorSettings],
    ['/reglages/identites', IdentitiesSettings],
    ['/reglages/club', ClubSettings],
    ['/reglages/membres', MembersSettings],
  ] as const
).map(([path, component]) => createRoute({ getParentRoute: () => shellRoute, path, component }));

// The former pages' addresses, kept by installed apps and bookmarks, lead to their place in Réglages.
const connectionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/connexions',
  beforeLoad: () => {
    throw redirect({ to: '/reglages/identites', replace: true });
  },
});
const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profil',
  beforeLoad: () => {
    throw redirect({ to: '/reglages/compte', replace: true });
  },
});

export const routeTree = rootRoute.addChildren([
  shellRoute.addChildren([teamRoute, challengesRoute, matchesRoute, settingsRoute, ...settingsScreens]),
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
