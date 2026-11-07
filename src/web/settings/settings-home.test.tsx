import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { renderInApp, testClub } from '../test-utils';
import { fakeApi } from './fake-api';
import { SettingsHome } from './settings-home';

// The browser's copy of the board, forgotten on signing out: happy-dom has no IndexedDB.
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }));

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

const asMember = { ...testClub, me: { ...testClub.me, role: 'member' as const } };

test('opens the account from the member’s own card', async () => {
  fakeApi();
  renderInApp(<SettingsHome />, { path: '/reglages' });
  const account = await screen.findByRole('link', { name: /alice/ });
  expect(account).toHaveAttribute('href', '/reglages/compte');
  expect(account).toHaveTextContent('Admin');
  expect(account).toHaveTextContent('alice@example.com · PC');
});

test('counts the paired collectors and the players left to associate', async () => {
  fakeApi({
    'GET /api/collectors': { devices: [{ id: 'pc-1', created: '2026-11-01T18:00:00Z', lastSeen: null }] },
    'GET /api/identities': {
      identities: [
        { slot: 'alice', known: true, owned: true, aliases: [{ playerId: 'Epic|alice|0', primary: true }] },
        { slot: 'bob', known: false, owned: false, aliases: [] },
      ],
      candidates: [],
    },
  });
  renderInApp(<SettingsHome />, { path: '/reglages' });
  expect(await screen.findByRole('link', { name: 'Collecteur 1 actif' })).toHaveAttribute(
    'href',
    '/reglages/collecteur',
  );
  expect(await screen.findByRole('link', { name: 'Identités 1 à associer' })).toHaveAttribute(
    'href',
    '/reglages/identites',
  );
});

test('shows the club and its members to the admins only', async () => {
  fakeApi({
    'GET /api/members': {
      members: [
        { id: 'm1', email: 'alice@example.com', role: 'admin', duoPseudo: 'alice', soloPseudo: null, platform: 'pc' },
        { id: 'm2', email: 'bob@example.com', role: 'member', duoPseudo: 'bob', soloPseudo: null, platform: null },
        { id: 'm3', email: 'new@example.com', role: 'member', duoPseudo: null, soloPseudo: null, platform: null },
      ],
    },
  });
  const { unmount } = renderInApp(<SettingsHome />, { path: '/reglages' });
  expect(await screen.findByRole('link', { name: /Club/ })).toHaveAttribute('href', '/reglages/club');
  // The invited address that never came is not a member yet.
  expect(await screen.findByRole('link', { name: 'Membres 2' })).toHaveAttribute('href', '/reglages/membres');
  unmount();

  renderInApp(<SettingsHome />, { club: asMember, path: '/reglages' });
  await screen.findByRole('link', { name: /Collecteur/ });
  expect(screen.queryByRole('link', { name: /Club/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Membres/ })).not.toBeInTheDocument();
});

test('turns the sounds off on this device', async () => {
  fakeApi();
  renderInApp(<SettingsHome />, { path: '/reglages' });
  const sounds = await screen.findByRole('switch', { name: 'Sons' });
  expect(sounds).toHaveAttribute('aria-checked', 'true');
  await userEvent.click(sounds);
  expect(sounds).toHaveAttribute('aria-checked', 'false');
  expect(localStorage.getItem('rl-sound')).toBe('off');
});

test('signs out, then shows the sign-in screen', async () => {
  const reload = vi.fn();
  vi.stubGlobal('location', { ...location, reload });
  const sent = fakeApi();
  renderInApp(<SettingsHome />, { path: '/reglages' });
  await userEvent.click(await screen.findByRole('button', { name: 'Se déconnecter' }));
  await vi.waitFor(() => expect(reload).toHaveBeenCalled());
  expect(sent).toContainEqual({ method: 'POST', path: '/api/auth/logout', body: null });
});

test('ends with the version and Epic’s notice', async () => {
  fakeApi({ 'GET /api/health': { commit: 'test', deployedAt: null } });
  renderInApp(<SettingsHome />, { path: '/reglages' });
  const footer = (await screen.findByText(/Version test/)).closest('p');
  expect(footer).not.toBeNull();
  expect(within(footer as HTMLElement).getByText(/n’a pas l’approbation d’Epic Games/)).toBeInTheDocument();
});
