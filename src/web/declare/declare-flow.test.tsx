import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { aResult, boardWith, renderInApp } from '../test-utils';
import { DeclareFlow } from './declare-flow';

// Declaring a series: choosing the exercise and how much, sending it, celebrating, and taking it back.

const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
});

/** Alice lost seven matches: 35 pushups owed. */
const board = boardWith({
  results: Array.from({ length: 7 }, (_, index) => aResult({ name: 'alice', match_guid: `m${index}` })),
});

function serve() {
  const sent: { method: string; path: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    sent.push({
      method: init?.method ?? 'GET',
      path: new URL(input, 'http://app.test').pathname,
      body: JSON.parse(String(init?.body ?? '{}')),
    });
    return Response.json({ ok: true });
  }) as typeof fetch;
  return sent;
}

test('shows what a series is worth and what will be left', async () => {
  renderInApp(<DeclareFlow open onClose={() => {}} />, { board });
  const sheet = await screen.findByRole('dialog');
  expect(within(sheet).getByText('Tes défis · 35 à rendre')).toBeInTheDocument();
  await userEvent.click(within(sheet).getByRole('button', { name: 'Gainage' }));
  expect(within(sheet).getByText('min de gainage')).toBeInTheDocument();
  await userEvent.click(within(sheet).getByRole('button', { name: '+1' }));
  // Two minutes of plank are worth 30 pushups: 5 left.
  expect(within(sheet).getByText('30')).toBeInTheDocument();
  expect(within(sheet).getByText('5')).toBeInTheDocument();
  await userEvent.click(within(sheet).getByRole('button', { name: 'Tout rendre' }));
  expect(within(sheet).getByText('2,5')).toBeInTheDocument();
  expect(within(sheet).getByRole('button', { name: 'Ardoise propre, je valide' })).toBeInTheDocument();
});

test('sends the series, celebrates it, and takes it back', async () => {
  const sent = serve();
  const onClose = vi.fn();
  renderInApp(<DeclareFlow open onClose={onClose} />, { board });
  await userEvent.click(await screen.findByRole('button', { name: 'Valider la série' }));
  expect(
    await screen.findByRole('status', { name: 'Série validée. Moins 10 pompes, il en reste 25.' }),
  ).toBeInTheDocument();
  expect(sent[0]).toMatchObject({
    method: 'POST',
    path: '/api/exercise',
    body: { player: 'alice', type: 'pushups', count: 10 },
  });

  await userEvent.click(screen.getByRole('button', { name: 'Annuler la série' }));
  await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(sent.find((request) => request.method === 'DELETE')).toMatchObject({
    path: '/api/exercise',
    body: { id: sent[0]?.body.id },
  });
});
