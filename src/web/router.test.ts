import { createMemoryHistory } from '@tanstack/react-router';
import { expect, test } from 'vitest';
import { createAppRouter } from './router';

// Every page keeps its address; an unknown one is left to the root, which shows the 404 behind the sign-in.

const router = createAppRouter(createMemoryHistory());

/** The routes an address opens, from the root down, and the one that shows "page not found", if any. */
function open(address: string) {
  const location = router.parseLocation(createMemoryHistory({ initialEntries: [address] }).location);
  const matches = router.matchRoutes(location);
  return {
    routes: matches.map((match) => match.routeId),
    notFoundAt: matches.find((match) => match._notFound)?.routeId ?? null,
    hash: location.hash,
  };
}

// The tabs share the app shell, a route of its own between the root and the page.
test.each([
  ['/', '/_shell/'],
  ['/defis', '/_shell/defis'],
  ['/matchs', '/_shell/matchs'],
  ['/reglages', '/_shell/reglages'],
])('the tab %s opens in the shell', (address, route) => {
  expect(open(address)).toMatchObject({ routes: ['__root__', '/_shell', route], notFoundAt: null });
});

test.each([
  ['/connexions', '/connexions'],
  ['/profil', '/profil'],
  ['/profil/', '/profil'],
])('%s opens its page', (address, route) => {
  expect(open(address)).toMatchObject({ routes: ['__root__', route], notFoundAt: null });
});

test('the Golden Rules open in the shell, in English from their address', () => {
  expect(open('/matchs/golden-rules')).toMatchObject({
    routes: ['__root__', '/_shell', '/_shell/matchs/golden-rules'],
    notFoundAt: null,
  });
  const english = router.parseLocation(
    createMemoryHistory({ initialEntries: ['/matchs/golden-rules?langue=en'] }).location,
  );
  expect(english.search).toEqual({ langue: 'en' });
});

test('the Stats page opens in the shell, on a season from its address', () => {
  expect(open('/stats')).toMatchObject({ routes: ['__root__', '/_shell', '/_shell/stats'], notFoundAt: null });
  for (const [address, saison] of [
    ['/stats?saison=23', 23],
    ['/stats?saison=tout', 'tout'],
  ] as const) {
    expect(router.parseLocation(createMemoryHistory({ initialEntries: [address] }).location).search.saison).toBe(
      saison,
    );
  }
});

test('the declaration sheet opens over the tab, from its search', () => {
  const location = router.parseLocation(createMemoryHistory({ initialEntries: ['/matchs?declarer=true'] }).location);
  expect(location.search).toEqual({ declarer: true });
  expect(open('/matchs?declarer=true')).toMatchObject({ routes: ['__root__', '/_shell', '/_shell/matchs'] });
});

test('an anchor stays on its page', () => {
  expect(open('/#monthly-mmr')).toMatchObject({
    routes: ['__root__', '/_shell', '/_shell/'],
    hash: 'monthly-mmr',
    notFoundAt: null,
  });
});

test.each(['/page-inconnue', '/direct', '/profil/x'])('%s shows the 404 of the root', (address) => {
  expect(open(address).notFoundAt).toBe('__root__');
});
