import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { aRank, boardWith, renderInApp } from '../test-utils';
import { AccountSettings } from './account';
import { fakeApi, writes } from './fake-api';

afterEach(() => vi.unstubAllGlobals());

test('shows the member’s ranks under their pseudo', async () => {
  fakeApi();
  const board = boardWith({
    doublesRanks: [
      aRank({
        player: 'alice',
        label: 'Champion III · Division II',
        tier: 18,
        solo: {
          mmr: 1480,
          label: 'Grand Champion I · Division I',
          tier: 19,
          matchesPlayed: null,
          status: 'ready',
          fetchedAt: null,
          peak: null,
          pseudo: null,
          best: null,
        },
      }),
    ],
  });
  renderInApp(<AccountSettings />, { board, path: '/reglages/compte' });
  expect(await screen.findByText('Grand Champion I en solo · Champion III en duo')).toBeInTheDocument();
});

test('saves the pseudos and the platform', async () => {
  const sent = fakeApi();
  renderInApp(<AccountSettings />, { path: '/reglages/compte' });
  await userEvent.type(await screen.findByLabelText('Pseudo solo'), 'alice-solo');
  await userEvent.click(screen.getByRole('button', { name: 'PlayStation' }));
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await vi.waitFor(() =>
    expect(writes(sent)).toEqual([
      {
        method: 'PUT',
        path: '/api/profile',
        body: { duoPseudo: 'alice', soloPseudo: 'alice-solo', platform: 'playstation' },
      },
    ]),
  );
});

test('refuses a pseudo the game would not accept, without sending it', async () => {
  const sent = fakeApi();
  renderInApp(<AccountSettings />, { path: '/reglages/compte' });
  const duo = await screen.findByLabelText('Pseudo duo');
  await userEvent.clear(duo);
  await userEvent.type(duo, '!');
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  expect(await screen.findByText(/Pseudo duo : de 2 à 32 lettres/)).toBeInTheDocument();
  expect(writes(sent)).toEqual([]);
});

test('deletes the account once confirmed', async () => {
  const assign = vi.fn();
  vi.stubGlobal('location', { ...location, assign });
  const sent = fakeApi();
  renderInApp(<AccountSettings />, { path: '/reglages/compte' });
  await userEvent.click(await screen.findByRole('button', { name: 'Supprimer mon compte…' }));
  expect(writes(sent)).toEqual([]);
  await userEvent.click(await screen.findByRole('button', { name: 'Supprimer mon compte' }));
  await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
  expect(writes(sent)).toEqual([{ method: 'DELETE', path: '/api/profile', body: null }]);
});
