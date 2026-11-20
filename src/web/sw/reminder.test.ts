import { describe, expect, it } from 'vitest';
import { notificationOf, optOutOf, reminderOf, stopAction } from './reminder';

const reminder = { title: '42 pompes à rendre', body: 'Le free play t’attend.', url: '/?declarer=true', tag: 'daily' };

describe('reminderOf', () => {
  it('reads the reminder the club sends', () => {
    expect(reminderOf(reminder)).toEqual(reminder);
  });

  it('shows nothing for anything else', () => {
    expect(reminderOf(null)).toBeNull();
    expect(reminderOf('42 pompes')).toBeNull();
    expect(reminderOf({ ...reminder, title: '' })).toBeNull();
    expect(reminderOf({ ...reminder, body: 3 })).toBeNull();
  });

  it('opens a page of the app only, never another site', () => {
    expect(reminderOf({ ...reminder, url: 'https://example.com/' })).toBeNull();
    expect(reminderOf({ ...reminder, url: '//example.com/' })).toBeNull();
  });
});

describe('notificationOf', () => {
  it('shows the message, opens its page on a tap, and offers to stop the reminders', () => {
    const [title, options] = notificationOf(reminder);
    expect(title).toBe('42 pompes à rendre');
    expect(options).toMatchObject({ body: 'Le free play t’attend.', tag: 'daily', data: { url: '/?declarer=true' } });
    expect(options.actions).toEqual([{ action: stopAction, title: 'Ne plus me rappeler' }]);
  });
});

describe('optOutOf', () => {
  it('proves the device with its endpoint and its secret, in URL-safe base64', () => {
    const secret = Uint8Array.from([251, 255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    const subscription = {
      endpoint: 'https://push.example.com/send/phone',
      getKey: (name: PushEncryptionKeyName) => (name === 'auth' ? secret.buffer : null),
    };
    expect(optOutOf(subscription)).toEqual({
      endpoint: 'https://push.example.com/send/phone',
      auth: '-_8AAQIDBAUGBwgJCgsMDQ',
    });
  });

  it('cannot prove a device without its secret', () => {
    expect(optOutOf({ endpoint: 'https://push.example.com/send/phone', getKey: () => null })).toBeNull();
  });
});
