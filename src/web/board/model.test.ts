import { expect, test } from 'vitest';
import {
  daysUntil,
  debtLine,
  filledSegments,
  lastMatchOf,
  matchesSummary,
  monthLead,
  payoffFor,
  savedLine,
  scoreboardOf,
  sinceLabel,
  standingsOf,
  streakOf,
  tierOf,
  weekStart,
} from './model';
import type { BoardState, Result } from './types';

const roster = ['aile-gauche', 'boost-max', 'centreur'];

function row(guid: string, name: string, team: number, winner: number, score: number, goals: number, received: string) {
  return {
    match_guid: guid,
    player_id: `Epic|${name}|0`,
    name,
    day: received.slice(0, 10),
    kind: 'match',
    team,
    winner,
    score,
    goals,
    received,
  } satisfies Result;
}

const board = (results: Result[], extra: Partial<BoardState> = {}): BoardState => ({
  results,
  exercises: [],
  collectors: [],
  ...extra,
});

test('a streak runs up to today or yesterday, and the best run is kept', () => {
  const days = new Set(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06']);
  expect(streakOf(days, '2026-11-07')).toEqual({ current: 2, best: 3 });
  expect(streakOf(days, '2026-11-08')).toEqual({ current: 0, best: 3 });
});

test('the week starts on Monday', () => {
  expect(weekStart('2026-11-07')).toBe('2026-11-02');
  expect(weekStart('2026-11-02')).toBe('2026-11-02');
});

test('the last match is the latest received, with its score from the club side', () => {
  const state = board([
    row('old', 'aile-gauche', 0, 0, 300, 3, '2026-11-06T20:00:00.000Z'),
    row('old', 'adversaire', 1, 0, 100, 1, '2026-11-06T20:00:00.000Z'),
    row('new', 'boost-max', 1, 0, 250, 2, '2026-11-06T21:00:00.000Z'),
    row('new', 'adversaire-2', 0, 0, 400, 3, '2026-11-06T21:00:00.000Z'),
  ]);
  const last = lastMatchOf(roster, state);
  expect(last?.guid).toBe('new');
  expect(last?.outcome).toBe('defeat');
  expect(last?.score).toEqual([2, 3]);
});

test('standings go by MMR, players without a reading last in roster order', () => {
  const state = board([], {
    doublesRanks: [
      {
        player: 'boost-max',
        mmr: 1100,
        label: 'Champion I',
        tier: 16,
        matchesPlayed: 10,
        status: 'ready',
        fetchedAt: null,
      },
      {
        player: 'centreur',
        mmr: 1200,
        label: 'Champion II',
        tier: 17,
        matchesPlayed: 10,
        status: 'ready',
        fetchedAt: null,
      },
    ],
  });
  expect(standingsOf(roster, state).map((p) => p.name)).toEqual(['centreur', 'boost-max', 'aile-gauche']);
});

test('the debt line names the defeat of the day, or says the member is up to date', () => {
  expect(debtLine(0, null, '2026-11-07')).toMatch(/^Tu es à jour/);
  expect(debtLine(1, null, '2026-11-07')).toBe('Il te reste 1 pompe. Gainage et abdos comptent aussi.');
  expect(debtLine(35, { received: '2026-11-07T20:40:00.000Z', day: '2026-11-07' }, '2026-11-07')).toBe(
    'Il te reste 35 pompes après la défaite de 21 h 40. Gainage et abdos comptent aussi.',
  );
  expect(debtLine(35, { received: '2026-11-06T20:40:00.000Z', day: '2026-11-06' }, '2026-11-07')).toContain(
    'après la défaite d’hier, 21 h 40',
  );
  expect(debtLine(35, { received: '2026-11-01T20:40:00.000Z', day: '2026-11-01' }, '2026-11-07')).toBe(
    'Il te reste 35 pompes. Gainage et abdos comptent aussi.',
  );
});

test('the debt bar rounds to tenths and fills when nothing is owed', () => {
  expect(filledSegments(140, 175)).toBe(8);
  expect(filledSegments(0, 0)).toBe(10);
  expect(filledSegments(500, 175)).toBe(10);
});

test('how long ago something arrived', () => {
  const now = Date.parse('2026-11-07T21:00:00.000Z');
  expect(sinceLabel('2026-11-07T20:48:00.000Z', now)).toBe('il y a 12 min');
  expect(sinceLabel('2026-11-07T18:00:00.000Z', now)).toBe('il y a 3 h');
  expect(sinceLabel('2026-11-05T18:00:00.000Z', now)).toBe('le jeudi 5 novembre');
});

test('the month leader needs two readings', () => {
  const monthly = (rows: { player: string; mmr: number | null }[]) =>
    board([], {
      monthly: {
        startsMonth: '2026-11',
        current: {
          month: '2026-11',
          cutoffAt: '2026-11-30T22:59:00.000Z',
          lastDay: '2026-11-30',
          status: 'open',
          missing: [],
          rows: rows.map((r) => ({ ...r, recordedAt: null, confirmedForClose: false })),
        },
        closed: [],
        allowedPlayers: [],
        debts: [],
      },
    });
  expect(monthLead(monthly([{ player: 'boost-max', mmr: 1100 }]))).toBeNull();
  expect(
    monthLead(
      monthly([
        { player: 'boost-max', mmr: 1100 },
        { player: 'centreur', mmr: 1182 },
        { player: 'aile-gauche', mmr: null },
      ]),
    ),
  ).toEqual({ leader: 'centreur', gap: 82 });
});

test('days before the close count up', () => {
  expect(daysUntil('2026-11-30T22:59:00.000Z', Date.parse('2026-11-07T21:00:00.000Z'))).toBe(24);
  expect(daysUntil('2026-11-30T22:59:00.000Z', Date.parse('2026-12-01T00:00:00.000Z'))).toBe(0);
});

test('what was saved, in French agreement', () => {
  expect(savedLine('pushups', 15)).toBe('15 pompes enregistrées.');
  expect(savedLine('pushups', 1)).toBe('1 pompe enregistrée.');
  expect(savedLine('plank', 120)).toBe('2 min de gainage enregistrées.');
  expect(savedLine('crunches', 20)).toBe('20 abdos enregistrés.');
});

test('paying the whole debt', () => {
  expect(payoffFor('pushups', 35)).toBe(35);
  expect(payoffFor('plank', 35)).toBe(2.5);
  expect(payoffFor('crunches', 35)).toBe(70);
});

test('a scoreboard names club players only, their side first', () => {
  const state = board([
    row('m', 'adversaire', 1, 1, 500, 2, '2026-11-06T20:00:00.000Z'),
    row('m', 'boost-max', 0, 1, 280, 0, '2026-11-06T20:00:00.000Z'),
    row('m', 'inconnu', 0, 1, 320, 1, '2026-11-06T20:00:00.000Z'),
    row('m', 'autre', 1, 1, 410, 1, '2026-11-06T20:00:00.000Z'),
  ]);
  expect(scoreboardOf(roster, state, 'm', 0).map((line) => line.label)).toEqual([
    'Coéquipier',
    'boost-max',
    'Adversaire 1',
    'Adversaire 2',
  ]);
});

test('the matches summary', () => {
  expect(matchesSummary([], 'hier')).toBe('Aucun match reçu hier.');
  const matches = [{ outcome: 'victory' }, { outcome: 'defeat' }, { outcome: 'defeat' }];
  expect(matchesSummary(matches, 'aujourd’hui', true)).toBe(
    '3 matchs, 1 victoire, 2 défaites. Les bras vont chauffer ce soir.',
  );
  expect(matchesSummary(matches, 'hier')).toBe('3 matchs, 1 victoire, 2 défaites. Les bras ont chauffé.');
  expect(matchesSummary([{ outcome: 'victory' }], 'hier')).toBe(
    '1 match, 1 victoire, 0 défaite. Les bras se reposent.',
  );
});

test('a rank under a name keeps its tier and drops its division', () => {
  expect(tierOf('Champion II · Division IV')).toBe('Champion II');
  expect(tierOf('Diamant III')).toBe('Diamant III');
  expect(tierOf('Classement non reçu')).toBe('Classement non reçu');
});
