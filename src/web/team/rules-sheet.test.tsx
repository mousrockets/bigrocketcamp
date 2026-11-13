import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Board } from '../board';
import { boardWith, renderInApp } from '../test-utils';
import { RulesSheet } from './rules-sheet';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T18:30:00Z'));
});
afterEach(() => vi.useRealTimers());

const open = (rules?: Board['rules']) =>
  renderInApp(<RulesSheet open onClose={() => {}} />, { board: boardWith(rules ? { rules } : {}) });

const lines = async (group: string) =>
  within(await screen.findByRole('region', { name: group }))
    .getAllByRole('listitem')
    .map((line) => line.textContent);

test('states every rule the club keeps by default', async () => {
  open();
  expect(await lines('Les matchs')).toEqual([
    '+5Par défaite, pour chaque joueur du club',
    '+5Bonus pour celui qui a le moins de points de l’équipeEx æquo : pas de bonus.',
    '+5Quitter avant la fin compte comme une défaite',
    '−5Si les adversaires FF',
    '−10Dès 1\u00a0000 points dans une partie',
  ]);
  expect(await lines('Les exercices')).toEqual([
    '15pompes pour 1 min de gainage',
    '10pompes pour 20 abdos',
    '1pompe d’avance par pompe faite en trop ou esquivéeElle compte pour tes prochaines défaites.',
    '10 spour annuler une série déclarée',
  ]);
  expect(await lines('Les défis')).toEqual([
    '3places sur le podium de la semaineLes exercices depuis lundi, comptés en pompes.',
    'MMRTes MMR 2v2 duo et solo additionnés, relevés le dernier jour du moisUn compte jamais relevé du mois compte pour 0.',
    '1boisson par joueur, offerte par le dernierEx æquo à la dernière place : personne ne paie.',
  ]);
  expect(
    screen.getByText('Journée en heure de Paris. Une règle changée s’applique dès le lendemain.'),
  ).toBeInTheDocument();
});

test('leaves out a rule the admins switched off, and says which change comes tomorrow', async () => {
  open({
    lastPlace: [{ enabled: true, effectiveFrom: '2026-11-01', ties: 'all' }],
    forfeit: [
      { enabled: true, effectiveFrom: '2026-11-01' },
      { enabled: false, effectiveFrom: '2026-11-10' },
    ],
    highScore: [
      { enabled: false, effectiveFrom: '2026-11-01' },
      { enabled: true, effectiveFrom: '2026-11-10' },
    ],
  });
  const matches = await lines('Les matchs');
  expect(matches).toContain('+5Bonus pour celui qui a le moins de points de l’équipeEx æquo : chacun prend le bonus.');
  expect(matches).toContain('−5Si les adversaires FFJusqu’à ce soir');
  expect(matches).toContain('−10Dès 1\u00a0000 points dans une partieDès demain');
});

test('drops a rule switched off today and tomorrow', async () => {
  open({
    lastPlace: [{ enabled: false, effectiveFrom: '2026-11-01', ties: 'none' }],
    forfeit: [],
    highScore: [],
  });
  const matches = await lines('Les matchs');
  expect(matches).toHaveLength(3);
  expect(matches.join()).not.toContain('Bonus');
  expect(matches.join()).not.toContain('1\u00a0000 points');
});
