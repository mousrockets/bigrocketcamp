import { describe, expect, test } from 'vitest';
import { shiftDay } from './days';
import {
  clearedTitle,
  declareUrl,
  messageOf,
  messageOrder,
  reminderCategories,
  reminderCategory,
  reminderMessages,
  reminderPush,
} from './reminder-messages';

// What a notification shows in full before the system cuts it: about two lines on a phone.
const maxBody = 120;
const maxTitle = 40;
const graphemes = new Intl.Segmenter('fr', { granularity: 'grapheme' });
/** The characters a member sees: an emoji counts once, whatever its code points. */
const length = (text: string) => [...graphemes.segment(text)].length;
const allMessages = Object.values(reminderMessages).flat();
const withGap = (message: string) => message.replace('{gap}', '1 234,25 pompes');
const emoji = /\p{Extended_Pictographic}/u;

describe('the stock of messages', () => {
  test('is large: about fifty for a debt, twenty-five for a settled day', () => {
    const owed = reminderMessages.small.length + reminderMessages.big.length;
    expect(owed + reminderMessages.grew.length + reminderMessages.shrank.length).toBeGreaterThanOrEqual(50);
    expect(reminderMessages.cleared.length).toBeGreaterThanOrEqual(25);
    for (const category of reminderCategories) expect(reminderMessages[category].length).toBeGreaterThanOrEqual(10);
  });

  test('says each joke once', () => {
    expect(new Set(allMessages).size).toBe(allMessages.length);
  });

  test('fits a notification, emojis and the biggest gap included', () => {
    for (const message of allMessages) expect(length(withGap(message)), message).toBeLessThanOrEqual(maxBody);
    expect(length(clearedTitle)).toBeLessThanOrEqual(maxTitle);
    expect(length('1 234,25 pompes à rendre')).toBeLessThanOrEqual(maxTitle);
  });

  test('says the change since the last reminder exactly where it is needed', () => {
    for (const message of [...reminderMessages.grew, ...reminderMessages.shrank]) {
      expect(message.match(/\{gap\}/g), message).toHaveLength(1);
    }
    for (const message of [...reminderMessages.small, ...reminderMessages.big, ...reminderMessages.cleared]) {
      expect(message, message).not.toMatch(/[{}]/);
    }
  });

  test('puts emojis in some messages of each category, not all', () => {
    for (const category of reminderCategories) {
      const lively = reminderMessages[category].filter((message) => emoji.test(message)).length;
      expect(lively, category).toBeGreaterThan(0);
      expect(lively, category).toBeLessThan(reminderMessages[category].length);
    }
  });

  test('writes French with typographic apostrophes', () => {
    for (const message of allMessages) expect(message, message).not.toContain("'");
  });
});

describe('the reminder of the day', () => {
  test('picks its category from the debt and the last one announced', () => {
    expect(reminderCategory(0, null)).toBe('cleared');
    expect(reminderCategory(0, 40)).toBe('cleared');
    expect(reminderCategory(15, null)).toBe('small');
    expect(reminderCategory(30, 30)).toBe('small');
    expect(reminderCategory(80, null)).toBe('big');
    expect(reminderCategory(25, 10)).toBe('grew');
    expect(reminderCategory(25, 40)).toBe('shrank');
  });

  test('shows the pushups owed and opens the declaration sheet', () => {
    const push = reminderPush({ memberId: 'member-alice', day: '2026-11-20', debt: 1235, lastDebt: 1235 });
    expect(push.title).toBe('1 235 pompes à rendre');
    expect(reminderMessages.big).toContain(push.body);
    expect(push.url).toBe(declareUrl);
  });

  test('says the day is settled when nothing is owed', () => {
    const push = reminderPush({ memberId: 'member-alice', day: '2026-11-20', debt: 0, lastDebt: 15 });
    expect(push.title).toBe('C’est bon pour aujourd’hui');
    expect(reminderMessages.cleared).toContain(push.body);
    expect(push.url).toBe('/');
  });

  test('says how much the debt moved since the last reminder', () => {
    const grew = reminderPush({ memberId: 'member-bob', day: '2026-11-20', debt: 25, lastDebt: 10 });
    expect(grew.body).toContain('15 pompes');
    const shrank = reminderPush({ memberId: 'member-bob', day: '2026-11-20', debt: 9, lastDebt: 10 });
    expect(shrank.body).toContain('1 pompe');
    expect(shrank.body).not.toContain('{gap}');
  });

  test('never repeats a message before the whole category was read', () => {
    for (const category of reminderCategories) {
      const stock = reminderMessages[category].length;
      const days = Array.from({ length: stock }, (_, index) => shiftDay('2026-12-25', index));
      const read = days.map((day) => messageOf('member-alice', category, day));
      expect(new Set(read).size, category).toBe(stock);
    }
  });

  test('gives each member their own order', () => {
    expect(messageOrder('member-alice', 'cleared')).not.toEqual(messageOrder('member-bob', 'cleared'));
    expect(messageOrder('member-alice', 'cleared')).toEqual(messageOrder('member-alice', 'cleared'));
    expect([...messageOrder('member-alice', 'big')].sort((a, b) => a - b)).toEqual(
      reminderMessages.big.map((_, index) => index),
    );
  });
});
