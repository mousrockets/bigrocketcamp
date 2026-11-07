import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { renderInApp } from '../test-utils';
import { ClubSettings } from './club-info';
import { fakeApi, writes } from './fake-api';

afterEach(() => vi.unstubAllGlobals());

test('renames the club and turns the +5 off', async () => {
  const sent = fakeApi();
  renderInApp(<ClubSettings />, { path: '/reglages/club' });
  const name = await screen.findByLabelText('Nom du club');
  await userEvent.clear(name);
  await userEvent.type(name, 'Little Rocket Camp');
  const rule = screen.getByRole('switch', { name: '+5 pour le moins de points' });
  expect(rule).toHaveAttribute('aria-checked', 'true');
  await userEvent.click(rule);
  await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await vi.waitFor(() =>
    expect(writes(sent)).toEqual([
      { method: 'PUT', path: '/api/club', body: { name: 'Little Rocket Camp' } },
      { method: 'PUT', path: '/api/club/rules', body: { lastPlace: { enabled: false } } },
    ]),
  );
});

test('sends nothing the admin did not change', async () => {
  const sent = fakeApi();
  renderInApp(<ClubSettings />, { path: '/reglages/club' });
  await userEvent.click(await screen.findByRole('button', { name: 'Enregistrer' }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(writes(sent)).toEqual([]);
});
