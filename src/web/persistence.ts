import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { QueryClient } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';
import { z } from 'zod';
import { boardChanges } from '../lib/contract';

// What the app keeps in the browser between visits: the board only, so that the app opens with it at once, offline
// too, and then reads only what changed since. IndexedDB holds it; lost or unreadable, the app reads it all again.

/** How long the browser's storage may take to answer: past it, the app goes on without what it keeps. */
export const storageWaitMs = 3000;

/**
 * IndexedDB may never answer: a deletion waiting for another tab to let go, a damaged browser profile. The app opens
 * only once the kept board is read, so it never waits for the storage longer than this: past it, it opens as on a
 * first visit and reads everything from the API.
 */
function answered<T>(operation: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), storageWaitMs);
  });
  return Promise.race([operation.catch(() => fallback), late]).finally(() => clearTimeout(timer));
}

const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => answered<string | undefined>(get(key), undefined),
    setItem: (key, value) => answered(set(key, value), undefined),
    removeItem: (key) => answered(del(key), undefined),
  },
  key: 'big-rocket-camp',
});

/**
 * Changes whenever the kept shape does, and an older copy is then dropped. The API only sends what changed since the
 * kept version: a field it starts sending would otherwise never reach a board kept before. The board as held
 * (board-sync.ts) has no schema, so its part changes by hand.
 */
export const keptShape = (schema: z.ZodType) =>
  `board-2 ${JSON.stringify(z.toJSONSchema(schema, { io: 'output', unrepresentable: 'any' }))}`;

/** A board unused this long is forgotten. */
const keptFor = 30 * 24 * 3_600_000;

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: keptFor,
  buster: keptShape(boardChanges),
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => query.queryKey[0] === 'board' && query.state.status === 'success',
  },
};

/** The kept boards outlive a query: the board query keeps its data as long as the browser does. */
export const keptQueryTime = keptFor;

/** Signing out forgets everything kept: the next member on this browser starts from nothing. */
export async function forgetEverything(queryClient?: QueryClient): Promise<void> {
  queryClient?.clear();
  await persister.removeClient();
}
