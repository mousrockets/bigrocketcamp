import { expect, test } from 'vitest';
import {
  defaultDodgeRules,
  defaultForfeitRules,
  defaultHighScoreRules,
  defaultLastPlaceRules,
  dodgedPushups,
  dodgeRules,
  forfeitRuleOn,
  highScoreRuleOn,
  lastPlaceBonus,
  lastPlaceRuleOn,
  matchIndex,
  validateMatchRosters,
} from './match-rules';

const day = '2026-11-05';
const scoreboard = [
  { matchGuid: 'm', playerId: 'Epic|a|0', team: 0, winner: 1, day, score: 20 },
  { matchGuid: 'm', playerId: 'Epic|b|0', team: 1, winner: 1, day, score: 100 },
];

test('on a defeat, the club player with the fewest points of their team pays 5 more', () => {
  expect(lastPlaceRuleOn(defaultLastPlaceRules, '2026-11-06').enabled).toBe(true);
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
  expect(lastPlaceBonus(bob, matches, roster, [{ effectiveFrom: '2026-11-06', enabled: false, ties: 'none' }])).toBe(0);
  expect(lastPlaceBonus(bob, matches, ['bob'])).toBe(0);
});

test('a match counts with the rule of its own day: the latest change on or before it', () => {
  const rules = [
    { effectiveFrom: '2026-11-10', enabled: false, ties: 'none' as const },
    { effectiveFrom: '2026-11-06', enabled: true, ties: 'none' as const },
    { effectiveFrom: '2026-11-20', enabled: true, ties: 'all' as const },
  ];
  expect(lastPlaceRuleOn(rules, '2026-11-05').enabled).toBe(false);
  expect(lastPlaceRuleOn(rules, '2026-11-06').enabled).toBe(true);
  expect(lastPlaceRuleOn(rules, '2026-11-09').enabled).toBe(true);
  expect(lastPlaceRuleOn(rules, '2026-11-10').enabled).toBe(false);
  expect(lastPlaceRuleOn(rules, '2026-11-25')).toMatchObject({ enabled: true, ties: 'all' });
  expect(lastPlaceRuleOn([], '2026-11-25').enabled).toBe(false);
});

test('the −5 of a forfeit won is on until the club turns it off, then follows each day’s rule', () => {
  expect(forfeitRuleOn(defaultForfeitRules, '2026-01-01').enabled).toBe(true);
  const rules = [
    { effectiveFrom: '2026-11-20', enabled: true },
    { effectiveFrom: '2026-11-10', enabled: false },
  ];
  expect(forfeitRuleOn(rules, '2026-11-09').enabled).toBe(true);
  expect(forfeitRuleOn(rules, '2026-11-10').enabled).toBe(false);
  expect(forfeitRuleOn(rules, '2026-11-19').enabled).toBe(false);
  expect(forfeitRuleOn(rules, '2026-11-20').enabled).toBe(true);
  const win = { name: 'alice', kind: 'match', team: 0, winner: 0, score: 300, forfeit: true };
  const forfeit = { ...defaultDodgeRules, forfeit: rules };
  expect(dodgedPushups({ ...win, day: '2026-11-09' }, forfeit)).toBe(5);
  expect(dodgedPushups({ ...win, day: '2026-11-12' }, forfeit)).toBe(0);
  expect(dodgedPushups({ ...win, day: '2026-11-12' })).toBe(5);
});

test('the −10 from 1000 points starts on 2026-11-07, then follows each day’s rule', () => {
  expect(highScoreRuleOn(defaultHighScoreRules, '2026-11-06').enabled).toBe(false);
  expect(highScoreRuleOn(defaultHighScoreRules, '2026-11-07').enabled).toBe(true);
  const rules = [...defaultHighScoreRules, { effectiveFrom: '2026-11-10', enabled: false }];
  expect(highScoreRuleOn(rules, '2026-11-09').enabled).toBe(true);
  expect(highScoreRuleOn(rules, '2026-11-10').enabled).toBe(false);
  expect(highScoreRuleOn([], '2026-11-25').enabled).toBe(false);
  const game = { name: 'alice', kind: 'match', team: 0, winner: 1, day: '2026-11-07' };
  expect(dodgedPushups({ ...game, score: 1001 })).toBe(10);
  expect(dodgedPushups({ ...game, score: 1001, winner: 0 })).toBe(10);
  expect(dodgedPushups({ ...game, score: 1000 })).toBe(10);
  expect(dodgedPushups({ ...game, score: 999 })).toBe(0);
  expect(dodgedPushups({ ...game, score: 1001, review_required: true })).toBe(0);
  expect(dodgedPushups({ ...game, score: 1001, kind: 'private' })).toBe(0);
  expect(dodgedPushups({ ...game, score: 1001, day: '2026-11-06' })).toBe(0);
  expect(dodgedPushups({ ...game, score: 1001, day: '2026-11-10' }, { ...defaultDodgeRules, highScore: rules })).toBe(
    0,
  );
  expect(dodgedPushups({ ...game, score: 1001, winner: 0, forfeit: true })).toBe(15);
  expect(dodgeRules({ forfeit: [] })).toEqual(defaultDodgeRules);
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
