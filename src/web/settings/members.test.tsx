import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { renderInApp, testClub } from '../test-utils';
import { ClubSettings } from './club-info';
import { fakeApi, writes } from './fake-api';
import { MembersSettings } from './members';

afterEach(() => vi.unstubAllGlobals());

const members = {
  members: [
    {
      id: 'member-bob',
      email: 'bob@example.com',
      role: 'member',
      duoPseudo: 'bob',
      soloPseudo: null,
      platform: 'xbox',
    },
    {
      id: 'member-alice',
      email: 'alice@example.com',
      role: 'admin',
      duoPseudo: 'alice',
      soloPseudo: null,
      platform: 'pc',
    },
    { id: 'member-new', email: 'new@example.com', role: 'member', duoPseudo: null, soloPseudo: null, platform: null },
  ],
};

test('lists the members, the member first, and those still to come', async () => {
  fakeApi({ 'GET /api/members': members });
  renderInApp(<MembersSettings />, { path: '/reglages/membres' });
  const list = await screen.findByRole('region', { name: '2 membres' });
  const rows = within(list).getAllByRole('button');
  expect(rows[0]).toHaveTextContent('alice');
  expect(rows[0]).toHaveTextContent('Admin');
  expect(rows[1]).toHaveTextContent('bob@example.com · Xbox');
  expect(within(screen.getByRole('region', { name: 'En attente' })).getByText('new@example.com')).toBeInTheDocument();
});

test('invites someone as an admin', async () => {
  const sent = fakeApi({ 'GET /api/members': members, 'POST /api/members': members.members[2] });
  renderInApp(<MembersSettings />, { path: '/reglages/membres' });
  await userEvent.type(await screen.findByLabelText('E-mail'), 'carol@example.com');
  const invite = screen.getByRole('region', { name: 'Inviter un joueur' });
  await userEvent.click(within(invite).getByRole('button', { name: 'Admin' }));
  await userEvent.click(screen.getByRole('button', { name: 'Envoyer l’invitation' }));
  expect(await screen.findByText('carol@example.com peut maintenant se connecter. Préviens-le !')).toBeInTheDocument();
  expect(writes(sent)).toEqual([
    { method: 'POST', path: '/api/members', body: { email: 'carol@example.com', role: 'admin' } },
  ]);
});

test('refuses an address that is not one', async () => {
  const sent = fakeApi({ 'GET /api/members': members });
  renderInApp(<MembersSettings />, { path: '/reglages/membres' });
  await userEvent.type(await screen.findByLabelText('E-mail'), 'carol');
  await userEvent.click(screen.getByRole('button', { name: 'Envoyer l’invitation' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(writes(sent)).toEqual([]);
});

test('makes a member an admin from their sheet', async () => {
  const sent = fakeApi({ 'GET /api/members': members });
  renderInApp(<MembersSettings />, { path: '/reglages/membres' });
  await userEvent.click(await screen.findByRole('button', { name: /^BO bob/ }));
  const sheet = await screen.findByRole('dialog');
  await userEvent.click(within(sheet).getByRole('button', { name: 'Admin' }));
  await vi.waitFor(() =>
    expect(writes(sent)).toEqual([
      { method: 'PATCH', path: '/api/members', body: { id: 'member-bob', role: 'admin' } },
    ]),
  );
});

test('sets a member’s first name from their sheet', async () => {
  const sent = fakeApi({ 'GET /api/members': members });
  renderInApp(<MembersSettings />, { path: '/reglages/membres' });
  await userEvent.click(await screen.findByRole('button', { name: /^BO bob/ }));
  const sheet = await screen.findByRole('dialog');
  await userEvent.type(within(sheet).getByLabelText('Prénom'), 'Robert');
  await userEvent.click(within(sheet).getByRole('button', { name: 'OK' }));
  await vi.waitFor(() =>
    expect(writes(sent)).toEqual([
      { method: 'PATCH', path: '/api/members', body: { id: 'member-bob', firstName: 'Robert' } },
    ]),
  );
});

test('keeps the club and its members for the admins', async () => {
  const sent = fakeApi({ 'GET /api/members': members });
  const asMember = { ...testClub, me: { ...testClub.me, role: 'member' as const } };
  const { unmount } = renderInApp(<MembersSettings />, { club: asMember, path: '/reglages/membres' });
  expect(await screen.findByText(/Cette page est réservée aux admins du club/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Envoyer l’invitation' })).not.toBeInTheDocument();
  unmount();
  renderInApp(<ClubSettings />, { club: asMember, path: '/reglages/club' });
  expect(await screen.findByText(/Cette page est réservée aux admins du club/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Nom du club')).not.toBeInTheDocument();
  expect(sent).toEqual([]);
});
