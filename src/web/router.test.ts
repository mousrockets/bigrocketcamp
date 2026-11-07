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

test.each([
  ['/', '/'],
  ['/direct', '/direct'],
  ['/direct/', '/direct'],
  ['/connexions', '/connexions'],
  ['/profil', '/profil'],
  ['/profil/', '/profil'],
  ['/reglages', '/reglages'],
  ['/matchs', '/matchs'],
  ['/exercices', '/exercices'],
  ['/defi', '/defi'],
])('%s opens its page', (address, route) => {
  expect(open(address)).toMatchObject({ routes: ['__root__', route], notFoundAt: null });
});

test("the board's anchors stay on the board", () => {
  expect(open('/#monthly-mmr')).toMatchObject({ routes: ['__root__', '/'], hash: 'monthly-mmr', notFoundAt: null });
});

test.each(['/page-inconnue', '/direct/autre', '/profil/x'])('%s shows the 404 of the root', (address) => {
  expect(open(address).notFoundAt).toBe('__root__');
});
