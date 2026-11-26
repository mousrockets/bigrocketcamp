import { expect, test } from 'vitest';
import { aRank, aResult, boardWith } from '../test-utils';
import { comparedPlayers, ranked, seasonsPlayed, statsOf, winRate } from './comparison';

// The Stats page compares the players over one season: S23 from 10 June, S24 from 23 September 2026.

/** A match of Alice and Bob together, won or lost, on a day of a season. */
const duo = (guid: string, day: string, won: boolean, goals: { alice: number; bob: number }) => [
  aResult({
    match_guid: guid,
    name: 'alice',
    day,
    received: `${day}T20:00:00Z`,
    winner: won ? 0 : 1,
    goals: goals.alice,
  }),
  aResult({ match_guid: guid, name: 'bob', day, received: `${day}T20:00:00Z`, winner: won ? 0 : 1, goals: goals.bob }),
];

const board = boardWith({
  results: [
    ...duo('s23-win', '2026-08-20', true, { alice: 1, bob: 3 }),
    ...duo('s24-win', '2026-11-02', true, { alice: 2, bob: 0 }),
    ...duo('s24-loss', '2026-11-03', false, { alice: 1, bob: 0 }),
    // Charlie plays alone, in S24 only.
    aResult({ match_guid: 'solo', name: 'charlie', day: '2026-11-04', received: '2026-11-04T20:00:00Z', winner: 0 }),
  ],
  doublesRanks: [aRank({ player: 'alice', tier: 16 }), aRank({ player: 'bob', tier: 19 })],
});
const roster = ['alice', 'bob', 'charlie'];

test('offers the seasons the club played in, the newest first', () => {
  expect(seasonsPlayed(board, roster)).toEqual([24, 23]);
});

test('counts each player’s matches of the season chosen, the member first', () => {
  const players = comparedPlayers(board, roster, 'bob', 'all', 'all', 24);
  expect(players.map((player) => [player.name, player.career.matches, player.career.goals])).toEqual([
    ['bob', 2, 0],
    ['alice', 2, 3],
    ['charlie', 1, 0],
  ]);
  expect(comparedPlayers(board, roster, 'bob', 'all', 'all', 23)[0]?.career.goals).toBe(3);
  expect(comparedPlayers(board, roster, 'bob', 'all', 'all', null)[0]?.career.matches).toBe(3);
  expect(players[0]?.tier).toBe(19);
});

test('ranks the players, ties sharing the lead and those without a match last', () => {
  const players = comparedPlayers(board, ['alice', 'bob', 'charlie', 'dana'], 'alice', 'all', 'all', 24);
  const wins = ranked(winRate, players);
  expect(wins.lines.map((line) => [line.player.name, line.value])).toEqual([
    ['charlie', 100],
    ['alice', 50],
    ['bob', 50],
    ['dana', null],
  ]);
  expect(wins.leaders.map((line) => line.player.name)).toEqual(['charlie']);
  expect(wins.lines.map((line) => line.share)).toEqual([1, 0.5, 0.5, 0]);

  const goals = statsOf('all').find((stat) => stat.label === 'Buts / match');
  if (!goals) throw new Error('Buts / match is compared');
  expect(ranked(goals, players).leaders.map((line) => [line.player.name, line.value])).toEqual([['alice', 1.5]]);
});

test('a tournament compares the tournaments won, and no demos', () => {
  const labels = statsOf('tournament').map((stat) => stat.label);
  expect(labels[0]).toBe('Tournois gagnés');
  expect(labels).not.toContain('Démos / match');
});
