import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { announce, currentAnnouncement } from './announcer';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test('an announcement stays 2.6 seconds, and a newer one replaces it', () => {
  announce('loss', '+5 pour boost-max');
  expect(currentAnnouncement()).toMatchObject({ kind: 'loss', text: '+5 pour boost-max' });
  vi.advanceTimersByTime(1000);
  announce('badge', 'Premier effort pour centreur');
  vi.advanceTimersByTime(1700);
  // The first one's timer must not hide the second.
  expect(currentAnnouncement()).toMatchObject({ kind: 'badge' });
  vi.advanceTimersByTime(1000);
  expect(currentAnnouncement()).toBeNull();
});
