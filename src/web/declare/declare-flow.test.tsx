import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { soundFamilies, soundIds, soundOf, sounds } from '../../lib/sounds';
import { Toaster } from '../components/ui/sonner';
import { aResult, boardWith, renderInApp } from '../test-utils';
import { DeclareFlow } from './declare-flow';

// Declaring a series: choosing the exercise and how much, sending it, celebrating, and taking it back.

const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
  vi.useRealTimers();
});

/** Alice lost seven matches: 35 pushups owed. */
const board = boardWith({
  results: Array.from({ length: 7 }, (_, index) => aResult({ name: 'alice', match_guid: `m${index}` })),
});

function serve(answers: Record<string, unknown> = {}) {
  const sent: { method: string; path: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    sent.push({
      method: init?.method ?? 'GET',
      path: new URL(input, 'http://app.test').pathname,
      body: JSON.parse(String(init?.body ?? '{}')),
    });
    const path = new URL(input, 'http://app.test').pathname;
    return Response.json(answers[`${init?.method ?? 'GET'} ${path}`] ?? answers[path] ?? { ok: true });
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

test('a series that clears the debt wins a sound badge, and plays it', async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const sound = soundIds[0];
  const sent = serve({ 'POST /api/sounds': { sound, unlocked: true } });
  renderInApp(<DeclareFlow open onClose={() => {}} />, { board });
  await userEvent.click(await screen.findByRole('button', { name: 'Tout rendre' }));
  await userEvent.click(screen.getByRole('button', { name: 'Ardoise propre, je valide' }));
  expect(
    await screen.findByRole('button', { name: `Nouveau badge : ${soundOf(sound).name}. Écouter.` }),
  ).toBeInTheDocument();
  expect(sent.find((request) => request.path === '/api/sounds')).toMatchObject({
    method: 'POST',
    body: { exerciseId: sent[0]?.body.id },
  });
  expect(play).toHaveBeenCalled();
  play.mockRestore();
});

test('a series that leaves pushups to do wins no badge', async () => {
  const sent = serve();
  renderInApp(<DeclareFlow open onClose={() => {}} />, { board });
  await userEvent.click(await screen.findByRole('button', { name: 'Valider la série' }));
  await screen.findByRole('status', { name: 'Série validée. Moins 10 pompes, il en reste 25.' });
  expect(sent.some((request) => request.path === '/api/sounds')).toBe(false);
});

test('a series without any debt to pay back wins no badge', async () => {
  const sent = serve();
  renderInApp(<DeclareFlow open onClose={() => {}} />, { board: boardWith() });
  await userEvent.click(await screen.findByRole('button', { name: 'Ardoise propre, je valide' }));
  await screen.findByRole('status');
  expect(sent.some((request) => request.path === '/api/sounds')).toBe(false);
});

test('a series the server never answers asks to send it again, without promising a retry nobody makes', async () => {
  globalThis.fetch = ((_input: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    })) as typeof fetch;
  renderInApp(
    <>
      <DeclareFlow open onClose={() => {}} />
      <Toaster />
    </>,
    { board },
  );
  const send = await screen.findByRole('button', { name: 'Valider la série' });
  // Time still flows for the page; the 15 s the request waits are skipped.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
  await userEvent.click(send);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(await screen.findByText('Le serveur ne répond pas. Vérifie ta connexion, puis réessaie.')).toBeInTheDocument();
  expect(screen.queryByText(/toute seule/)).not.toBeInTheDocument();
});

test('says in French that the connection is lost, and a series sent again never counts twice', async () => {
  const ids: unknown[] = [];
  globalThis.fetch = (async (_input: string, init?: RequestInit) => {
    ids.push(JSON.parse(String(init?.body)).id);
    throw new TypeError('Failed to fetch');
  }) as typeof fetch;
  renderInApp(
    <>
      <DeclareFlow open onClose={() => {}} />
      <Toaster />
    </>,
    { board },
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Valider la série' }));
  expect(await screen.findByText('Connexion Internet indisponible. Réessaie dans un instant.')).toBeInTheDocument();
  expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Valider la série' }));
  await vi.waitFor(() => expect(ids).toHaveLength(2));
  // If the first one did arrive, the API knows its id and does not count it again.
  expect(ids[1]).toBe(ids[0]);
});

/** Alice's collection, as the API answers it once the draw is made. */
const collectionOf = (won: readonly string[]) => ({
  collections: [{ player: 'alice', badges: won.map((sound) => ({ sound, count: 1 })) }],
});

test('the badge that completes a family says so', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const garage = sounds.filter((sound) => sound.family === 0).map((sound) => sound.id);
  serve({ 'POST /api/sounds': { sound: garage[4], unlocked: true }, 'GET /api/sounds': collectionOf(garage) });
  renderInApp(<DeclareFlow open onClose={() => {}} />, { board });
  await userEvent.click(await screen.findByRole('button', { name: 'Tout rendre' }));
  await userEvent.click(screen.getByRole('button', { name: 'Ardoise propre, je valide' }));
  expect(await screen.findByText(`Famille complète · ${soundFamilies[0].name}`)).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Collection complète' })).not.toBeInTheDocument();
  vi.restoreAllMocks();
});

test('the fortieth badge celebrates the whole collection, until a tap', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  serve({ 'POST /api/sounds': { sound: soundIds[0], unlocked: true }, 'GET /api/sounds': collectionOf(soundIds) });
  renderInApp(<DeclareFlow open onClose={() => {}} />, { board });
  await userEvent.click(await screen.findByRole('button', { name: 'Tout rendre' }));
  await userEvent.click(screen.getByRole('button', { name: 'Ardoise propre, je valide' }));
  const complete = await screen.findByRole('region', { name: 'Collection complète' });
  expect(within(complete).getByText('40/40')).toBeInTheDocument();
  await userEvent.click(within(complete).getByRole('button', { name: 'Trop fort' }));
  expect(screen.queryByRole('region', { name: 'Collection complète' })).not.toBeInTheDocument();
  vi.restoreAllMocks();
});
