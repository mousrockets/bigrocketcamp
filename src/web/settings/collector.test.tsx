import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { renderInApp } from '../test-utils';
import { CollectorSettings } from './collector';
import { fakeApi, writes } from './fake-api';

afterEach(() => vi.unstubAllGlobals());

const inTenMinutes = () => new Date(Date.now() + 10 * 60_000).toISOString();

test('shows a pairing code to type in the collector', async () => {
  fakeApi({
    'GET /api/collectors': { devices: [] },
    'POST /api/collectors': () => ({ code: 'K7Q4ZP8M', expires: inTenMinutes() }),
  });
  renderInApp(<CollectorSettings />, { path: '/reglages/collecteur' });
  await userEvent.click(await screen.findByRole('button', { name: 'Afficher un code' }));
  expect(await screen.findByRole('img', { name: 'Code K7Q4 ZP8M' })).toBeInTheDocument();
  expect(screen.getByText('Expire dans 10 min')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Copier le code' })).toBeInTheDocument();
});

test('shows a paired PC and revokes it', async () => {
  const sent = fakeApi({
    'GET /api/collectors': {
      devices: [{ id: 'pc-1', created: '2026-11-01T18:00:00Z', lastSeen: new Date(Date.now() - 60_000).toISOString() }],
    },
  });
  renderInApp(<CollectorSettings />, { path: '/reglages/collecteur' });
  expect(await screen.findByText('PC de alice')).toBeInTheDocument();
  expect(screen.getByText(/^Actif · dernier contact à/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Révoquer' }));
  await vi.waitFor(() =>
    expect(writes(sent)).toEqual([{ method: 'DELETE', path: '/api/collectors', body: { id: 'pc-1' } }]),
  );
});
