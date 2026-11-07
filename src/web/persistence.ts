import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { QueryClient } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';

// What the app keeps in the browser between visits: the board only, so that the app opens with it at once, offline
// too, and then reads only what changed since. IndexedDB holds it; lost or unreadable, the app reads it all again.

const persister = createAsyncStoragePersister({
  storage: { getItem: get, setItem: set, removeItem: del },
  key: 'big-rocket-camp',
});

/** A board unused this long is forgotten. */
const keptFor = 30 * 24 * 3_600_000;

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: keptFor,
  // Changes whenever the kept shape does: an older copy is then dropped.
  buster: 'board-2',
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
