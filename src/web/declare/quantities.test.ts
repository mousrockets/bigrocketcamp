import { expect, test } from 'vitest';
import { apiCount, minus, payoff, plus, pushupsOf } from './quantities';

test('the plank counts in minutes on screen and in seconds for the API', () => {
  expect(apiCount('plank', 1.25)).toBe(75);
  expect(apiCount('pushups', 10)).toBe(10);
  expect(pushupsOf('plank', 1)).toBe(15);
  expect(pushupsOf('crunches', 20)).toBe(10);
});

test('steps never go below one step, nor drift', () => {
  expect(plus(0.25, 0.5)).toBe(0.75);
  expect(plus(0.1, 0.2)).toBe(0.3);
  expect(minus('pushups', 5)).toBe(5);
  expect(minus('plank', 1)).toBe(0.75);
});

test('« Tout rendre » pays all that is owed, rounded up', () => {
  expect(payoff('pushups', 35)).toBe(35);
  expect(payoff('plank', 35)).toBe(2.5);
  expect(payoff('crunches', 35)).toBe(70);
  expect(payoff('pushups', 0)).toBe(5);
});
