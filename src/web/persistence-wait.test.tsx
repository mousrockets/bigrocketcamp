import { useQuery } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { forgetEverything, persistOptions, storageWaitMs } from './persistence';
import { createQueryClient } from './query-client';

// A browser whose IndexedDB never answers: a deletion waiting for another tab to let go, a damaged profile.
vi.mock('idb-keyval', () => {
  const never = () => new Promise<never>(() => {});
  return { get: never, set: never, del: never };
});

afterEach(() => vi.useRealTimers());

function Club() {
  const { data } = useQuery({ queryKey: ['club'], queryFn: async () => 'Le club' });
  return <p>{data ?? 'Chargement'}</p>;
}

test('opens without what it keeps when the browser’s storage never answers', async () => {
  render(
    <PersistQueryClientProvider client={createQueryClient()} persistOptions={persistOptions}>
      <Club />
    </PersistQueryClientProvider>,
  );
  // While the kept board is read, nothing is asked of the API.
  expect(screen.getByText('Chargement')).toBeInTheDocument();
  // Real time: the kept board is given up on after the wait, and the app asks the API.
  expect(await screen.findByText('Le club', {}, { timeout: storageWaitMs + 1000 })).toBeInTheDocument();
}, 10_000);

test('signs out even when the browser’s storage never answers', async () => {
  vi.useFakeTimers();
  const forgotten = forgetEverything(createQueryClient());
  await vi.advanceTimersByTimeAsync(storageWaitMs);
  await expect(forgotten).resolves.toBeUndefined();
});
