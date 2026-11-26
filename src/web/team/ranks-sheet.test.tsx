import { screen, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { renderInApp, setViewportWidth } from '../test-utils';
import { RanksSheet } from './ranks-sheet';

const open = () => renderInApp(<RanksSheet open onClose={() => {}} />);

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

test('goes away when pulled down on a phone', async () => {
  setViewportWidth(390);
  try {
    open();
    expect(await screen.findByRole('dialog', { name: 'Les ranks' })).toHaveAttribute('data-swipe-direction', 'down');
  } finally {
    setViewportWidth(1024);
  }
});
