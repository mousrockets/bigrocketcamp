import { screen, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { aRank, boardWith, renderInApp, setViewportWidth, testClub } from '../test-utils';
import { RanksSheet } from './ranks-sheet';

const solo = (tier: number, mmr: number) => ({
  mmr,
  label: '',
  tier,
  matchesPlayed: null,
  fetchedAt: '2026-11-07T18:22:00Z',
  peak: null,
  status: 'ready' as const,
});

const club = { ...testClub, me: { ...testClub.me, soloPseudo: 'alice_solo' } };
const board = boardWith({
  doublesRanks: [
    aRank({ player: 'alice', mmr: 1362, tier: 18, solo: solo(19, 1509) }),
    aRank({ player: 'bob', mmr: 1500, tier: 19, solo: solo(17, 1238) }),
  ],
});

const open = (options: Parameters<typeof renderInApp>[1]) =>
  renderInApp(<RanksSheet open onClose={() => {}} />, options);

test('shows the member’s solo account and the MMR left to the next rank', async () => {
  open({ club, board });
  const mine = await screen.findByRole('region', { name: 'Ton compte solo' });
  expect(within(mine).getByRole('img', { name: 'Icône de rank Grand Champion I' })).toBeInTheDocument();
  expect(within(mine).getByText('alice_solo')).toBeInTheDocument();
  expect(within(mine).getByText('1 509')).toBeInTheDocument();
  expect(mine).toHaveTextContent('Encore 66 MMR');
  expect(within(mine).getByRole('progressbar', { name: 'Vers Grand Champion II' })).toBeInTheDocument();
});

test('ranks the club by the MMR of their solo accounts', async () => {
  open({ club, board });
  const lines = within(await screen.findByRole('region', { name: 'Le club' })).getAllByRole('listitem');
  expect(lines[0]).toHaveTextContent('1aliceTOIGrand Champion I1 509');
  expect(lines[1]).toHaveTextContent('2bobChampion II1 238');
});

test('lists every rank from Supersonic Legend down, with the MMR that wins it', async () => {
  open({ club, board });
  const steps = within(await screen.findByRole('region', { name: 'Les paliers' })).getAllByRole('listitem');
  expect(steps).toHaveLength(22);
  expect(steps[0]).toHaveTextContent('Supersonic Legend1 861');
  expect(steps[3]).toHaveTextContent('Grand Champion I1 435');
  expect(steps[21]).toHaveTextContent('Bronze I0');
  expect(screen.getByText(/n’a pas l’approbation d’Epic Games/)).toBeInTheDocument();
});

test('sends a member without a solo account to Réglages', async () => {
  open({ board: boardWith({ doublesRanks: [aRank({ player: 'bob', solo: solo(17, 1238) })] }) });
  expect(await screen.findByText('Pas de compte solo')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Réglages' })).toHaveAttribute('href', '/reglages/compte');
  expect(screen.queryByRole('region', { name: 'Ton compte solo' })).not.toBeInTheDocument();
});

test('goes away when pulled down on a phone', async () => {
  setViewportWidth(390);
  try {
    open({ club, board });
    expect(await screen.findByRole('dialog', { name: 'Les ranks' })).toHaveAttribute('data-swipe-direction', 'down');
  } finally {
    setViewportWidth(1024);
  }
});
