import { expect, test } from 'vitest';
import { defeatMessage } from './defeat-message';

const first = () => 0;

test('a single defeat says what it adds, +5 or +10', () => {
  expect(defeatMessage([{ player: 'alice', pushups: 5 }], first)).toBe('+5 pour alice… courage, champion.');
  expect(defeatMessage([{ player: 'alice', pushups: 10 }], first)).toBe('+10 pour alice… courage, champion.');
  expect(defeatMessage([{ player: 'alice', pushups: 10 }], () => 1)).toBe(
    'alice prend 10 pompes. Le ballon ne pardonne pas.',
  );
});

test('every phrasing names the amount', () => {
  for (let index = 0; index < 4; index++) {
    expect(defeatMessage([{ player: 'alice', pushups: 10 }], () => index)).toContain('10');
  }
});

test('two players with different amounts each get theirs', () => {
  expect(
    defeatMessage([
      { player: 'chat-pris-tea', pushups: 10 },
      { player: 'nokouki', pushups: 5 },
    ]),
  ).toBe('+10 pour chat-pris-tea, +5 pour nokouki… courage, champions.');
});

test('players with the same amount share it, and several new defeats of a player add up', () => {
  expect(
    defeatMessage([
      { player: 'alice', pushups: 5 },
      { player: 'bob', pushups: 5 },
      { player: 'carla', pushups: 5 },
    ]),
  ).toBe('+5 pour alice, bob et carla… courage, champions.');
  expect(
    defeatMessage(
      [
        { player: 'alice', pushups: 10 },
        { player: 'alice', pushups: 5 },
      ],
      first,
    ),
  ).toBe('+15 pour alice… courage, champion.');
  expect(defeatMessage([])).toBe('');
});
