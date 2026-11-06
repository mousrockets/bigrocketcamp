import { expect, test } from 'vitest';
import { lastPlaceBonus, lastPlaceRule, matchIndex, validateMatchRosters } from './match-rules';

const day = '2026-11-05';
const scoreboard = [
  { matchGuid: 'm', playerId: 'Epic|a|0', team: 0, winner: 1, day, score: 20 },
  { matchGuid: 'm', playerId: 'Epic|b|0', team: 1, winner: 1, day, score: 100 },
];

test('the last-place rule stays disabled until it is switched on', () => {
  expect(lastPlaceRule.enabled).toBe(false);
  const rows = scoreboard.map((r) => ({
    match_guid: r.matchGuid,
    player_id: r.playerId,
    name: r.playerId,
    kind: 'match',
    ...r,
  }));
  const matches = matchIndex(rows, [{ match_guid: 'm', expected_players: 2 }]);
  const loser = rows[0];
  if (!loser) throw new Error('expected a loser');
  expect(matches.get('m')?.complete).toBe(true);
  expect(lastPlaceBonus(loser, matches)).toBe(0);
  expect(lastPlaceBonus(loser, matches, { ...lastPlaceRule, enabled: true })).toBe(5);
});

test('declared rosters must match a coherent scoreboard', () => {
  expect(validateMatchRosters(undefined, scoreboard)).toEqual([]);
  expect(validateMatchRosters([{ MatchGuid: 'm', PlayerCount: 2 }], scoreboard)).toEqual([
    { matchGuid: 'm', playerCount: 2 },
  ]);
  for (const invalid of [
    'not-a-list',
    [{ MatchGuid: 'm', PlayerCount: 1 }],
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
  const sameTeam = scoreboard.map((r) => ({ ...r, team: 0 }));
  expect(() => validateMatchRosters([{ MatchGuid: 'm', PlayerCount: 2 }], sameTeam)).toThrow(
    'Tableau des scores incomplet ou incohérent.',
  );
});
