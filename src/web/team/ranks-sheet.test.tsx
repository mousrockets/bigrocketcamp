import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fakeApi } from '../settings/fake-api';
import { renderInApp, setViewportWidth } from '../test-utils';
import { RanksSheet } from './ranks-sheet';

const open = () => renderInApp(<RanksSheet open onClose={() => {}} />);

beforeEach(() => {
  fakeApi({ 'GET /api/stats/zen': { zen: null } });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-26T11:00:00Z'));
});
afterEach(() => vi.useRealTimers());

test('lists every rank from Supersonic Legend down, with the MMR that wins it, and nothing else', async () => {
  open();
  const steps = within(await screen.findByRole('region', { name: 'Les paliers' })).getAllByRole('listitem');
  expect(steps).toHaveLength(22);
  expect(steps[0]).toHaveTextContent('Supersonic Legend1 861');
  expect(steps[3]).toHaveTextContent('Grand Champion I1 435');
  expect(steps[21]).toHaveTextContent('Bronze I0');
  expect(screen.getByText(/n’a pas l’approbation d’Epic Games/)).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Ton compte solo' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Le club' })).not.toBeInTheDocument();
});

test('crowns the ladder with Zen, at his own rating, once the rank source read it', async () => {
  fakeApi({ 'GET /api/stats/zen': { zen: { name: 'zenrll', mmr: 2210, fetchedAt: '2026-11-26T08:00:00.000Z' } } });
  open();
  const ladder = await screen.findByRole('region', { name: 'Les paliers' });
  await within(ladder).findByText('Zen');
  const steps = within(ladder).getAllByRole('listitem');
  expect(steps).toHaveLength(23);
  expect(steps[0]).toHaveTextContent('Zenzenrll, il y a 3 h2 210');
  expect(steps[1]).toHaveTextContent('Supersonic Legend1 861');
});

test('goes away when pulled down on a phone', async () => {
  setViewportWidth(390);
  try {
    open();
    expect(await screen.findByRole('dialog', { name: 'Les ranks' })).toHaveAttribute('data-swipe-direction', 'down');
  } finally {
    setViewportWidth(1024);
  }
});
