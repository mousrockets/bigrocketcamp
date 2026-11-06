import { describe, expect, test } from 'vitest';
import {
  balance,
  type ChallengeRules,
  defaultRules,
  exerciseEffect,
  isValidExercise,
  pushupsFor,
  pushupsOwed,
  type Scoreboard,
} from './challenges';

const doubles: Scoreboard = {
  winner: 1,
  complete: true,
  players: [
    { playerId: 'alice', team: 0, score: 120 },
    { playerId: 'bob', team: 0, score: 300 },
    { playerId: 'carla', team: 1, score: 250 },
    { playerId: 'dan', team: 1, score: 400 },
  ],
};

const lastPlaceRules: ChallengeRules = { ...defaultRules, lastPlace: { enabled: true, pushups: 5, ties: 'none' } };

describe('pushups owed for a match', () => {
  test('a loss costs five pushups, a win nothing', () => {
    expect(pushupsOwed(doubles, 'bob', defaultRules)).toBe(5);
    expect(pushupsOwed(doubles, 'carla', defaultRules)).toBe(0);
  });

  test('a player missing from the scoreboard owes nothing', () => {
    expect(pushupsOwed(doubles, 'erin', defaultRules)).toBe(0);
  });

  test('finishing last on a losing team costs extra when the club enables it', () => {
    expect(pushupsOwed(doubles, 'alice', defaultRules)).toBe(5);
    expect(pushupsOwed(doubles, 'alice', lastPlaceRules)).toBe(10);
  });

  test('nobody finishes last on an incomplete scoreboard', () => {
    expect(pushupsOwed({ ...doubles, complete: false }, 'alice', lastPlaceRules)).toBe(5);
  });

  test('a shared last place costs extra only when the club counts ties', () => {
    const tied: Scoreboard = {
      ...doubles,
      players: doubles.players.map((player) => (player.playerId === 'bob' ? { ...player, score: 120 } : player)),
    };
    expect(pushupsOwed(tied, 'alice', lastPlaceRules)).toBe(5);
    expect(
      pushupsOwed(tied, 'alice', { ...lastPlaceRules, lastPlace: { ...lastPlaceRules.lastPlace, ties: 'all' } }),
    ).toBe(10);
  });

  test('the lowest score on the winning team owes nothing', () => {
    const winnerLast: Scoreboard = { ...doubles, winner: 0 };
    expect(pushupsOwed(winnerLast, 'alice', lastPlaceRules)).toBe(0);
  });
});

describe('exercises', () => {
  test('a crunch is worth half a pushup and a second of plank a quarter', () => {
    expect(pushupsFor({ kind: 'pushups', amount: 2 })).toBe(2);
    expect(pushupsFor({ kind: 'crunches', amount: 20 })).toBe(10);
    expect(pushupsFor({ kind: 'plank', amount: 1 })).toBe(0.25);
  });

  test('thirty pushups owed, one minute of plank and twenty crunches leave five', () => {
    const done = pushupsFor({ kind: 'plank', amount: 60 }) + pushupsFor({ kind: 'crunches', amount: 20 });
    expect(balance(30, done)).toEqual({ remaining: 5, ahead: 0 });
  });

  test('extra pushups count against the next losses', () => {
    expect(balance(5, 25)).toEqual({ remaining: 0, ahead: 20 });
  });

  test('only whole, positive and reasonable amounts are accepted', () => {
    expect(isValidExercise({ kind: 'pushups', amount: 5 })).toBe(true);
    expect(isValidExercise({ kind: 'plank', amount: 60_000 })).toBe(true);
    for (const amount of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isValidExercise({ kind: 'pushups', amount })).toBe(false);
    }
    expect(isValidExercise({ kind: 'crunches', amount: 10_001 })).toBe(false);
    expect(isValidExercise({ kind: 'plank', amount: 60_001 })).toBe(false);
  });

  test('an exercise reports only the debt it really reduced', () => {
    expect(exerciseEffect(5, { kind: 'pushups', amount: 20 })).toEqual({
      equivalent: 20,
      reduction: 5,
      remaining: 0,
      excess: 15,
    });
    expect(exerciseEffect(0, { kind: 'pushups', amount: 20 })).toEqual({
      equivalent: 20,
      reduction: 0,
      remaining: 0,
      excess: 20,
    });
    expect(exerciseEffect(5, { kind: 'plank', amount: 60 })).toEqual({
      equivalent: 15,
      reduction: 5,
      remaining: 0,
      excess: 10,
    });
    expect(exerciseEffect(3.75, { kind: 'pushups', amount: 5 })).toEqual({
      equivalent: 5,
      reduction: 3.75,
      remaining: 0,
      excess: 1.25,
    });
    expect(exerciseEffect(5, { kind: 'pushups', amount: 2 })).toEqual({
      equivalent: 2,
      reduction: 2,
      remaining: 3,
      excess: 0,
    });
  });
});
