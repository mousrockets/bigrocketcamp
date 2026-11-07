import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { renderInApp } from '../test-utils';
import { fakeApi, writes } from './fake-api';
import { IdentitiesSettings } from './identities';

afterEach(() => vi.unstubAllGlobals());

const candidates = [
  { playerId: 'Epic|stranger|0', name: 'Stranger', day: '2026-11-06' },
  { playerId: 'Epic|alice-2|0', name: 'alice-2', day: '2026-11-06' },
];

test('offers a new account named after the member, and associates it', async () => {
  const sent = fakeApi({
    'GET /api/identities': {
      identities: [
        { slot: 'alice', known: true, owned: true, aliases: [{ playerId: 'Epic|alice-main|0', primary: true }] },
        { slot: 'bob', known: false, owned: false, aliases: [] },
      ],
      candidates,
    },
    'POST /api/identities': { ok: true },
  });
  renderInApp(<IdentitiesSettings />, { path: '/reglages/identites' });
  const card = await screen.findByRole('group', { name: 'Nouveau compte vu' });
  expect(within(card).getByText('Epic · alice-2')).toBeInTheDocument();
  // A stranger seen in the same match is not offered once the member has an account.
  expect(within(card).queryByText(/Stranger/)).not.toBeInTheDocument();
  await userEvent.click(within(card).getByRole('button', { name: 'Associer à alice' }));
  await vi.waitFor(() =>
    expect(writes(sent)).toEqual([
      {
        method: 'POST',
        path: '/api/identities',
        body: { slot: 'alice', playerId: 'Epic|alice-2|0', action: 'confirm' },
      },
    ]),
  );
});

test('lets a member without an account pick theirs among the players seen', async () => {
  const sent = fakeApi({
    'GET /api/identities': {
      identities: [{ slot: 'alice', known: false, owned: true, aliases: [] }],
      candidates,
    },
    'POST /api/identities': { ok: true },
  });
  renderInApp(<IdentitiesSettings />, { path: '/reglages/identites' });
  const card = await screen.findByRole('group', { name: 'Nouveau compte vu' });
  await userEvent.click(within(card).getByRole('button', { name: 'Stranger' }));
  expect(within(card).getByText('Epic · Stranger')).toBeInTheDocument();
  await userEvent.click(within(card).getByRole('button', { name: 'Associer à alice' }));
  await vi.waitFor(() =>
    expect(writes(sent)).toEqual([
      {
        method: 'POST',
        path: '/api/identities',
        body: { slot: 'alice', playerId: 'Epic|stranger|0', action: 'confirm' },
      },
    ]),
  );
});

test('lists each player’s accounts, and removes the member’s extra one', async () => {
  const sent = fakeApi({
    'GET /api/identities': {
      identities: [
        {
          slot: 'alice',
          known: true,
          owned: true,
          aliases: [
            { playerId: 'Epic|alice-main|0', primary: true },
            { playerId: 'Epic|alice-alt|0', primary: false },
          ],
        },
        { slot: 'bob', known: false, owned: false, aliases: [] },
      ],
      candidates: [],
    },
    'POST /api/identities': { ok: true },
  });
  renderInApp(<IdentitiesSettings />, { path: '/reglages/identites' });
  const mine = await screen.findByRole('region', { name: 'alice · toi' });
  expect(within(mine).getByText('Principal')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'bob' })).getByText('À associer')).toBeInTheDocument();
  await userEvent.click(within(mine).getByRole('button', { name: 'Retirer Epic · …ce-alt' }));
  await vi.waitFor(() =>
    expect(writes(sent)).toEqual([
      {
        method: 'POST',
        path: '/api/identities',
        body: { slot: 'alice', playerId: 'Epic|alice-alt|0', action: 'remove' },
      },
    ]),
  );
});
