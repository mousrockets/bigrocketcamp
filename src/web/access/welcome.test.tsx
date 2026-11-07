import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { renderInApp, testClub } from '../test-utils';
import { Welcome } from './welcome';

// A new member's first visit: their duo pseudo, an optional solo one, and their platform.

const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
  vi.unstubAllGlobals();
});

const newcomer = { ...testClub, me: { ...testClub.me, duoPseudo: null, soloPseudo: null, platform: null } };

test('refuses a pseudo the game would not accept', async () => {
  globalThis.fetch = vi.fn() as unknown as typeof fetch;
  renderInApp(<Welcome />, { club: newcomer });
  await userEvent.type(await screen.findByLabelText('Pseudo de ton compte duo'), '!');
  await userEvent.click(screen.getByRole('button', { name: 'Let’s go' }));
  expect(await screen.findByText(/Pseudo duo : de 2 à 32 lettres/)).toBeInTheDocument();
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

test('saves the profile, then opens the club', async () => {
  const assign = vi.fn();
  vi.stubGlobal('location', { ...location, assign });
  const sent: unknown[] = [];
  globalThis.fetch = (async (_input: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  renderInApp(<Welcome />, { club: newcomer });
  await userEvent.type(await screen.findByLabelText('Pseudo de ton compte duo'), 'alice-duo');
  await userEvent.click(screen.getByRole('button', { name: 'Switch' }));
  await userEvent.click(screen.getByRole('button', { name: 'Let’s go' }));
  await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
  expect(sent).toEqual([{ duoPseudo: 'alice-duo', soloPseudo: '', platform: 'switch' }]);
});
