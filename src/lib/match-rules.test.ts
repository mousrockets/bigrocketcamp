import { expect, test } from 'vitest';
import { lastPlaceBonus, lastPlaceRule, matchIndex, validateMatchRosters } from './match-rules';

const day = '2026-11-05';
const scoreboard = [
  { matchGuid: 'm', playerId: 'Epic|a|0', team: 0, winner: 1, day, score: 20 },
  { matchGuid: 'm', playerId: 'Epic|b|0', team: 1, winner: 1, day, score: 100 },
];

test('on a defeat, the club player with the fewest points of their team pays 5 more', () => {
  expect(lastPlaceRule.enabled).toBe(true);
  const day = '2026-11-06';
  const rows = [
    { name: 'alice', score: 300, team: 0 },
    { name: 'bob', score: 120, team: 0 },
    { name: 'stranger', score: 50, team: 0 },
    { name: 'opponent', score: 10, team: 1 },
  ].map((player) => ({
    match_guid: 'm',
    player_id: `Epic|${player.name}|0`,
    kind: 'match',
    day,
    winner: 1,
    ...player,
  }));
  const roster = ['alice', 'bob'];
  const matches = matchIndex(rows);
  const [alice, bob] = rows;
  if (!alice || !bob) throw new Error('expected two club players');
  expect(lastPlaceBonus(bob, matches, roster)).toBe(5);
  expect(lastPlaceBonus(alice, matches, roster)).toBe(0);
  expect(lastPlaceBonus(bob, matches, roster, { ...lastPlaceRule, enabled: false })).toBe(0);
  expect(lastPlaceBonus(bob, matches, ['bob'])).toBe(0);
});

test('declared rosters must match a coherent scoreboard', () => {
  expect(validateMatchRosters(undefined, scoreboard)).toEqual([]);
  expect(validateMatchRosters([{ MatchGuid: 'm', PlayerCount: 2 }], scoreboard)).toEqual([
    { matchGuid: 'm', playerCount: 2 },
  ]);
  for (const invalid of [
    'not-a-list',
    [{ MatchGuid: 'm', PlayerCount: 0 }],
    [{ MatchGuid: 'm', PlayerCount: 17 }],
    [
      { MatchGuid: 'm', PlayerCount: 2 },
      { MatchGuid: 'm', PlayerCount: 2 },
    ],
  ]) {
    expect(() => validateMatchRosters(invalid, scoreboard)).toThrow('Liste de participants invalide.');
  }
  expect(() => validateMatchRosters([{ MatchGuid: 'm', PlayerCount: 3 }], scoreboard)).toThrow(
    'Tableau des scores incomplet ou incohérent.',
  );
  // After a forfeit, the losers may all have left: a single team remains on the scoreboard.
  const sameTeam = scoreboard.map((r) => ({ ...r, team: 0 }));
  expect(validateMatchRosters([{ MatchGuid: 'm', PlayerCount: 2 }], sameTeam)).toEqual([
    { matchGuid: 'm', playerCount: 2 },
  ]);
  const unknownTeam = scoreboard.map((r) => ({ ...r, team: 2 }));
  expect(() => validateMatchRosters([{ MatchGuid: 'm', PlayerCount: 2 }], unknownTeam)).toThrow(
    'Tableau des scores incomplet ou incohérent.',
  );
});
