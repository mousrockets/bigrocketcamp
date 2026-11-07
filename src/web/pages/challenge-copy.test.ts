import { describe, expect, test } from 'vitest';
import type { DrinkDebt, MonthResult } from '../board/monthly';
import { closedMonthLine, closingLabel, dayMonthOf, debtsInOrder, monthSummary, readingLabel } from './challenge-copy';

// The challenge's words come from the club's data: fictitious players here.

const month = (status: string, extra: Partial<MonthResult> = {}): MonthResult => ({
  month: '2026-10',
  cutoffAt: '2026-10-31T23:00:00.000Z',
  lastDay: '2026-10-31',
  rows: ['ana', 'ben', 'cleo'].map((player) => ({ player, mmr: 1000, recordedAt: null, confirmedForClose: true })),
  status,
  missing: [],
  ...extra,
});

const debt = (recipient: string, extra: Partial<DrinkDebt> = {}): DrinkDebt => ({
  id: `2026-10:cleo:${recipient}`,
  month: '2026-10',
  payer: 'cleo',
  recipient,
  paidAt: null,
  canSettle: false,
  canUndo: false,
  ...extra,
});

describe('closingLabel', () => {
  test('a close at midnight is the last minute of the last day', () => {
    expect(closingLabel('2026-11-30T23:00:00.000Z')).toBe('le 30 novembre à 23 h 59');
  });
  test('another time is said as it is', () => {
    expect(closingLabel('2026-11-30T17:30:00.000Z')).toBe('le 30 novembre à 18 h 30');
  });
});

test('dayMonthOf writes the last day as the design does', () => {
  expect(dayMonthOf('2026-10-31')).toBe('31/10');
});

describe('readingLabel', () => {
  const now = Date.parse('2026-11-07T21:00:00.000Z');
  test.each([
    ['2026-11-07T08:00:00.000Z', 'ce matin'],
    ['2026-11-07T14:00:00.000Z', 'cet après-midi'],
    ['2026-11-07T19:30:00.000Z', 'ce soir'],
    ['2026-11-06T22:00:00.000Z', 'hier'],
    ['2026-11-05T10:00:00.000Z', 'le 5 nov.'],
  ])('%s reads as "%s" in Paris', (recordedAt, label) => {
    expect(readingLabel(recordedAt, now)).toBe(label);
  });
});

describe('closedMonthLine', () => {
  test('names the last and counts the others', () => {
    expect(closedMonthLine(month('final', { losers: ['cleo'] }))).toBe(
      'cleo finit lanterne rouge. Santé ! Une boisson pour chacun des deux autres.',
    );
  });
  test('a tie owes nothing', () => {
    expect(closedMonthLine(month('tied'))).toBe(
      'Égalité parfaite en bas du classement : tout le monde garde son porte-monnaie.',
    );
  });
  test('a missing rating blocks the debts', () => {
    expect(closedMonthLine(month('incomplete', { missing: ['ben'] }))).toBe(
      'Pas de dette automatique : MMR de fin de mois manquant pour ben.',
    );
  });
});

test('the drinks the member can settle come first', () => {
  const ordered = debtsInOrder([debt('ana'), debt('ben', { canSettle: true })]);
  expect(ordered.map((d) => d.recipient)).toEqual(['ben', 'ana']);
});

describe('monthSummary', () => {
  test('a month with drinks owed puts the member’s first, with its button', () => {
    const mine = debt('ben', { canSettle: true });
    expect(monthSummary(month('final', { losers: ['cleo'] }), [debt('ana'), mine])).toEqual({
      tone: 'owed',
      title: 'Octobre · cleo → ben',
      detail: '1 boisson à offrir · aussi à ana',
      settle: mine,
    });
  });
  test('a drink just marked can be taken back, on a card that names it', () => {
    const drunk = debt('ben', { paidAt: '2026-11-02T20:00:00.000Z', canUndo: true });
    expect(monthSummary(month('final'), [debt('ana'), drunk])).toEqual({
      tone: 'settled',
      title: 'Octobre · cleo → ben',
      detail: 'C’est bu · encore à offrir à ana',
      undo: drunk,
    });
  });
  test('another drink to mark comes before taking one back', () => {
    const next = debt('ana', { canSettle: true });
    const drunk = debt('ben', { paidAt: '2026-11-02T20:00:00.000Z', canUndo: true, canSettle: true });
    expect(monthSummary(month('final'), [next, drunk])).toEqual({
      tone: 'owed',
      title: 'Octobre · cleo → ana',
      detail: '1 boisson à offrir',
      settle: next,
    });
  });
  test('a round fully drunk', () => {
    const paid = { paidAt: '2026-11-01T20:00:00.000Z' };
    expect(monthSummary(month('final'), [debt('ana', paid), debt('ben', paid)])).toEqual({
      tone: 'settled',
      title: 'Octobre · tournée payée',
      detail: 'Toutes les boissons sont bues',
    });
  });
  test('a tie and a missing rating owe nothing', () => {
    expect(monthSummary(month('tied'), [])).toMatchObject({ tone: 'settled', title: 'Octobre · ex æquo' });
    expect(monthSummary(month('incomplete'), [])).toMatchObject({
      tone: 'missing',
      title: 'Octobre · pas de dette',
      detail: 'MMR de fin de mois manquant',
    });
  });
});
