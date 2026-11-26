import { expect, test } from 'vitest';
import type { SeasonMmr } from '../../lib/contract';
import { anExercise, aRank, aResult, aSoloRank, boardWith } from '../test-utils';
import { allStats, bestOf, comparedPlayers, keyStats, prizes, ranked, seasonsPlayed } from './comparison';

// The Stats page compares the players over one season: S23 from 10 June, S24 from 23 September 2026.

/** A match of Alice and Bob together, won or lost, on a day of a season. */
const duo = (guid: string, day: string, won: boolean, parts: { alice: number; bob: number }, extra = {}) =>
  (['alice', 'bob'] as const).map((name) =>
    aResult({
      match_guid: guid,
      name,
      day,
      received: `${day}T20:00:00Z`,
      winner: won ? 0 : 1,
      goals: parts[name],
      ...extra,
    }),
  );

const peak = (mmr: number, tier: number) => ({ mmr, label: 'Champion I · Division II', tier });

const board = boardWith({
  results: [
    ...duo('s23-win', '2026-08-20', true, { alice: 1, bob: 3 }),
    ...duo('s24-win', '2026-11-02', true, { alice: 2, bob: 0 }, { blue_goals: 2, orange_goals: 0, overtime: true }),
    ...duo('s24-loss', '2026-11-03', false, { alice: 1, bob: 0 }, { blue_goals: 1, orange_goals: 3, forfeit: true }),
    // Charlie plays alone, in S24 only, at 1 in the morning, and leaves.
    aResult({ match_guid: 'night', name: 'charlie', day: '2026-11-04', received: '2026-11-04T00:30:00Z', left: true }),
  ],
  doublesRanks: [
    aRank({ player: 'alice', tier: 16, solo: aSoloRank({ pseudo: 'alice-en-solo', playerId: 'Epic|alice-solo|0' }) }),
    aRank({ player: 'bob', tier: 19 }),
  ],
  exercises: [
    anExercise({ id: 'a1', player: 'alice', count: 40, day: '2026-11-02', created: '2026-11-02T21:00:00Z' }),
    anExercise({
      id: 'a2',
      player: 'alice',
      type: 'plank',
      count: 60,
      day: '2026-11-03',
      created: '2026-11-03T21:00:00Z',
    }),
    anExercise({ id: 'a3', player: 'alice', count: 100, day: '2026-08-20', created: '2026-08-20T21:00:00Z' }),
  ],
});
const seasons: SeasonMmr[] = [
  { player: 'alice', account: 'duo', season: 24, first: 1100, last: 1180, peak: peak(1250, 16) },
  { player: 'alice', account: 'solo', season: 24, first: 1000, last: 980, peak: peak(1040, 15) },
  { player: 'alice', account: 'duo', season: 23, first: 1000, last: 1090, peak: peak(1120, 15) },
  { player: 'bob', account: 'duo', season: 24, first: 1300, last: 1290, peak: peak(1330, 17) },
];
const roster = ['alice', 'bob', 'charlie'];
const statNamed = (label: string) => {
  const stat = allStats('doubles').find((candidate) => candidate.label === label);
  if (!stat) throw new Error(`${label} is in the table`);
  return stat;
};

test('offers the seasons the club played or was read in, the newest first', () => {
  expect(seasonsPlayed(board, seasons, roster)).toEqual([24, 23]);
});

test('counts each player’s matches of the season chosen, the member first', () => {
  const players = comparedPlayers(board, seasons, roster, 'bob', 'all', 'all', 24);
  expect(players.map((player) => [player.name, player.career.matches, player.career.goals])).toEqual([
    ['bob', 2, 0],
    ['alice', 2, 3],
    ['charlie', 1, 0],
  ]);
  expect(comparedPlayers(board, seasons, roster, 'bob', 'all', 'all', 23)[0]?.career.goals).toBe(3);
  expect(comparedPlayers(board, seasons, roster, 'bob', 'all', 'all', null)[0]?.career.matches).toBe(3);
  expect(players[0]?.tier).toBe(19);
});

test('takes the 2v2 peak of the account that climbed highest, and what the season brought it', () => {
  const [alice] = comparedPlayers(board, seasons, roster, 'alice', 'all', 'all', 24);
  expect(alice?.mmr).toEqual({ account: 'duo', peak: peak(1250, 16), gained: 80, fall: 70 });
  const [solo] = comparedPlayers(board, seasons, roster, 'alice', 'all', 'solo', 24);
  expect(solo?.mmr).toMatchObject({ account: 'solo', gained: -20, fall: 60 });
  // Every season: the highest peak, the seasons' gains added up.
  const [always] = comparedPlayers(board, seasons, roster, 'alice', 'all', 'duo', null);
  expect(always?.mmr).toMatchObject({ peak: peak(1250, 16), gained: 170, fall: 70 });
  expect(comparedPlayers(board, seasons, roster, 'alice', 'all', 'all', 24)[2]?.mmr).toBe(null);
});

test('counts the season’s exercises in pushups', () => {
  const [alice] = comparedPlayers(board, seasons, roster, 'alice', 'all', 'all', 24);
  // 40 pushups, and a minute of plank worth 15.
  expect(alice?.pushups).toBe(55);
});

test('reads the endings of the matches: goals conceded, overtimes, forfeits, matches left, late nights', () => {
  const players = comparedPlayers(board, seasons, roster, 'alice', 'all', 'all', 24);
  const row = (label: string) => players.map((player) => statNamed(label).value(player));
  expect(row('Buts encaissés / match')).toEqual([1.5, 1.5, null]);
  expect(row('Clean sheets')).toEqual([1, 1, null]);
  expect(row('Prolongations gagnées')).toEqual([1, 1, 0]);
  expect(row('FF donnés')).toEqual([1, 1, 0]);
  expect(row('Matchs quittés')).toEqual([0, 0, 1]);
  expect(row('Matchs après minuit')).toEqual([0, 0, 1]);
});

test('ranks the players, ties sharing the lead and those without a figure last', () => {
  const players = comparedPlayers(board, seasons, ['alice', 'bob', 'charlie', 'dana'], 'alice', 'all', 'all', 24);
  const wins = ranked(statNamed('% de victoires'), players);
  expect(wins.lines.map((line) => [line.player.name, line.value])).toEqual([
    ['alice', 50],
    ['bob', 50],
    ['charlie', 0],
    ['dana', null],
  ]);
  expect(wins.leaders.map((line) => line.player.name)).toEqual(['alice', 'bob']);

  const goals = keyStats.find((stat) => stat.label === 'Buts / match');
  if (!goals) throw new Error('Buts / match is a key stat');
  expect(ranked(goals, players).leaders.map((line) => [line.player.name, line.value])).toEqual([['alice', 1.5]]);
  expect(prizes.map((prize) => prize.prize)).toContain('Le noctambule');
});

test('the table lights the best figure of a line, the lowest when less is better, none when all are equal', () => {
  const players = comparedPlayers(board, seasons, roster, 'alice', 'all', 'all', 24);
  expect(bestOf(statNamed('Buts'), players)).toBe(3);
  expect(bestOf(statNamed('Matchs quittés'), players)).toBe(0);
  expect(bestOf(statNamed('Clean sheets'), players)).toBe(null);
  expect(allStats('tournament').map((stat) => stat.label)).toContain('Tournois gagnés');
  expect(allStats('doubles').map((stat) => stat.label)).not.toContain('Tournois gagnés');
});

test('names a player by their solo pseudo when only the solo accounts are compared', () => {
  const shown = (account: 'all' | 'duo' | 'solo') =>
    comparedPlayers(board, seasons, roster, 'alice', 'all', account, 24).map((player) => player.shown);
  expect(shown('solo')).toEqual(['alice-en-solo', 'bob', 'charlie']);
  expect(shown('all')).toEqual(['alice', 'bob', 'charlie']);
  expect(shown('duo')).toEqual(['alice', 'bob', 'charlie']);
});
