import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test } from 'vitest';
import { renderInApp } from '../test-utils';
import { SignIn } from './sign-in';

// Signing in: an address, then the six-digit code it received.

const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
});

/** Answers the sign-in routes, and records what was asked. */
function serve(verify: () => Response = () => Response.json({ error: 'Code incorrect ou expiré.' }, { status: 401 })) {
  const sent: { path: string; body: unknown }[] = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const path = new URL(input, 'http://app.test').pathname;
    sent.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null });
    return path === '/api/auth/verify' ? verify() : new Response(null, { status: 204 });
  }) as typeof fetch;
  return sent;
}

test('refuses an address that is not one, without asking the API', async () => {
  const sent = serve();
  renderInApp(<SignIn />);
  await userEvent.type(await screen.findByLabelText('Adresse e-mail'), 'pas-une-adresse');
  await userEvent.click(screen.getByRole('button', { name: 'Envoie le code' }));
  expect(await screen.findByText('Adresse e-mail invalide.')).toBeInTheDocument();
  expect(sent).toEqual([]);
});

test('sends the code, then signs in with the six digits', async () => {
  const sent = serve();
  renderInApp(<SignIn />);
  await userEvent.type(await screen.findByLabelText('Adresse e-mail'), 'alice@example.com');
  await userEvent.click(screen.getByRole('button', { name: 'Envoie le code' }));
  expect(await screen.findByRole('heading', { name: 'Check ta boîte mail' })).toBeInTheDocument();
  expect(sent).toEqual([{ path: '/api/auth/code', body: { email: 'alice@example.com' } }]);

  await userEvent.type(screen.getByLabelText('Code à six chiffres'), '123456');
  expect(await screen.findByText('Code incorrect ou expiré.')).toBeInTheDocument();
  expect(sent.at(-1)).toEqual({ path: '/api/auth/verify', body: { email: 'alice@example.com', code: '123456' } });
});

test('goes back to the address to change it', async () => {
  serve();
  renderInApp(<SignIn />);
  await userEvent.type(await screen.findByLabelText('Adresse e-mail'), 'alice@example.com');
  await userEvent.click(screen.getByRole('button', { name: 'Envoie le code' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Changer d’adresse' }));
  expect(await screen.findByLabelText('Adresse e-mail')).toBeInTheDocument();
});
