import type { Board } from '../board';
import { anExercise, aRank, aResult, boardWith, testClub } from '../test-utils';

// October in a small fictional club: five matches, a few series, and a monthly challenge closed on September's heels.

export const roster = ['alice', 'bob', 'carol'];
export const recapClub = {
  ...testClub,
  players: [...testClub.players, { slot: 'carol', platform: 'xbox' as const, firstName: null }],
  roster,
};

const won = { winner: 0 };
const lost = { winner: 1 };

type Closed = NonNullable<Board['monthly']>['closed'][number];
const closedMonth = (month: string, rows: [string, number][], losers: string[] = []): Closed => ({
  month,
  lastDay: `${month}-30`,
  cutoffAt: `${month}-30T22:00:00.000Z`,
  closedAt: `${month}-30T22:05:00.000Z`,
  rows: rows.map(([player, mmr]) => ({
    player,
    mmr,
    recordedAt: null,
    confirmedForClose: true,
    account: 'duo',
    duo: mmr,
    solo: null,
  })),
  status: 'final',
  missing: [],
  losers,
});

export const octoberBoard = boardWith(
  {
    results: [
      aResult({ name: 'alice', match_guid: 'm1', day: '2026-10-03', ...won, demos: 2, crossbar_hits: 1 }),
      aResult({ name: 'bob', match_guid: 'm1', day: '2026-10-03', ...won, demos: 1, crossbar_hits: 0 }),
      aResult({ name: 'alice', match_guid: 'm2', day: '2026-10-04', ...lost, overtime: true }),
      aResult({ name: 'bob', match_guid: 'm2', day: '2026-10-04', ...lost, overtime: true }),
      aResult({ name: 'alice', match_guid: 'm3', day: '2026-10-05', ...lost, forfeit: true }),
      aResult({ name: 'bob', match_guid: 'm4', day: '2026-10-06', ...won }),
      aResult({ name: 'bob', match_guid: 'm5', day: '2026-10-07', ...won }),
      aResult({ name: 'bob', match_guid: 'm6', day: '2026-11-02', ...lost }),
    ],
    exercises: [
      anExercise({ id: 'exercise-0000000001', player: 'alice', count: 40, day: '2026-10-03' }),
      anExercise({ id: 'exercise-0000000002', player: 'carol', type: 'plank', count: 120, day: '2026-10-08' }),
      anExercise({ id: 'exercise-0000000003', player: 'bob', count: 25, day: '2026-11-03' }),
    ],
    doublesRanks: [
      aRank({ player: 'alice', tier: 19, mmr: 1480 }),
      aRank({ player: 'bob', tier: 17, mmr: 1250 }),
      aRank({ player: 'carol', tier: 17, mmr: 1090 }),
    ],
    monthly: {
      startsMonth: '2026-09',
      current: {
        month: '2026-11',
        startAt: '2026-10-31T23:00:00.000Z',
        lastDay: '2026-11-30',
        lastDayStartAt: '2026-11-29T23:00:00.000Z',
        cutoffAt: '2026-11-30T23:00:00.000Z',
        rows: [],
        status: 'live',
        missing: [],
      },
      closed: [
        closedMonth('2026-09', [
          ['alice', 1400],
          ['bob', 1200],
          ['carol', 1100],
        ]),
        closedMonth(
          '2026-10',
          [
            ['alice', 1480],
            ['bob', 1250],
            ['carol', 1090],
          ],
          ['carol'],
        ),
      ],
      allowedPlayers: roster,
      debts: [],
    },
  },
  recapClub,
);
