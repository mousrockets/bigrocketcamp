import { expect, test } from 'vitest';
import { gameStatsOf, statfeedLabelsOf, storedGameStats } from './game-stats';

// The stats collector 0.7.0 sends beyond the scoreboard (its README, « Les stats de chaque joueur »).

const line = {
  Name: 'joueur-un',
  Shots: 5,
  Touches: 38,
  CarTouches: 4,
  Statfeed: { Save: 3, Demolish: 1 },
  StatfeedSecondary: { Demolish: 2 },
  KickoffTouches: 3,
  OwnGoals: 0,
  AssistsTo: { 'Steam|76561198000000000|0': 1 },
  FastestGoal: 87.3,
  LongestGoal: 3162,
  QuickestGoal: 12.5,
  HardestHit: 1450.2,
};

test('reads every stat of a player’s line, with the match’s arena', () => {
  expect(gameStatsOf(line, 'Stadium_P')).toEqual({
    shots: 5,
    touches: 38,
    carTouches: 4,
    statfeed: { Save: 3, Demolish: 1 },
    statfeedSecondary: { Demolish: 2 },
    kickoffTouches: 3,
    ownGoals: 0,
    assistsTo: { 'Steam|76561198000000000|0': 1 },
    fastestGoal: 87.3,
    longestGoal: 3162,
    quickestGoal: 12.5,
    hardestHit: 1450.2,
    arena: 'Stadium_P',
  });
});

test('drops each unreadable stat on its own, and gives none for an older collector', () => {
  const odd = {
    ...line,
    Shots: -1,
    Statfeed: { 'not an event!': 1 },
    AssistsTo: Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`Epic|${index}|0`, 1])),
    HardestHit: 0,
  };
  const stats = gameStatsOf(odd, 'no spaces allowed');
  expect(stats).not.toHaveProperty('shots');
  expect(stats).not.toHaveProperty('statfeed');
  expect(stats).not.toHaveProperty('assistsTo');
  expect(stats).not.toHaveProperty('hardestHit');
  expect(stats).not.toHaveProperty('arena');
  expect(stats).toMatchObject({ touches: 38, longestGoal: 3162 });
  expect(gameStatsOf({ Name: 'older', Score: 100 }, undefined)).toBe(null);
});

test('reads back stored stats, and nothing from a broken JSON', () => {
  expect(storedGameStats(JSON.stringify({ shots: 2, arena: 'Stadium_P' }))).toEqual({ shots: 2, arena: 'Stadium_P' });
  expect(storedGameStats('{')).toBe(null);
  expect(storedGameStats(null)).toBe(null);
});

test('keeps the game’s readable words for its events, trimmed', () => {
  expect(statfeedLabelsOf({ Save: ' Arrêt ', Demolish: 'Démolition' })).toEqual([
    ['Save', 'Arrêt'],
    ['Demolish', 'Démolition'],
  ]);
  expect(statfeedLabelsOf({ Save: '\u0007' })).toEqual([]);
  expect(statfeedLabelsOf('not an object')).toEqual([]);
});
