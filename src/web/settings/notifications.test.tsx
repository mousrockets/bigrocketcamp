import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { remindersOff } from '../../lib/contract';
import { blockedMessage } from '../reminders';
import { renderInApp } from '../test-utils';
import { fakeApi, writes } from './fake-api';
import { NotificationSettings } from './notifications';

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

const clubKey = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const endpoint = 'https://push.example.com/send/phone';

/** A browser that can receive notifications, with the permission given, and a push service that subscribes it. */
function aPushBrowser(permission: NotificationPermission) {
  let subscription: object | null = null;
  const subscribe = vi.fn(async () => {
    subscription = {
      endpoint,
      options: { applicationServerKey: null },
      toJSON: () => ({ endpoint, keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } }),
      unsubscribe: async () => true,
    };
    return subscription;
  });
  const pushManager = { getSubscription: async () => subscription, subscribe };
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', { permission, requestPermission: async () => permission });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: async () => ({ pushManager }) },
  });
  return { subscribe };
}

test('says only that the club has no reminders yet, even with the notifications blocked', async () => {
  aPushBrowser('denied');
  fakeApi({ 'GET /api/reminders': { publicKey: null, devices: [] } });
  renderInApp(<NotificationSettings />, { path: '/reglages/notifications' });
  expect(await screen.findByText(remindersOff)).toBeInTheDocument();
  expect(screen.queryByText(blockedMessage)).not.toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Rappel quotidien' })).toHaveAttribute('aria-disabled', 'true');
});

test('tells how to allow the notifications once the club sends reminders', async () => {
  aPushBrowser('denied');
  fakeApi({ 'GET /api/reminders': { publicKey: clubKey, devices: [] } });
  renderInApp(<NotificationSettings />, { path: '/reglages/notifications' });
  expect(await screen.findByText(blockedMessage)).toBeInTheDocument();
});

test('turns the reminder on at the hour picked, 19 h by default', async () => {
  const { subscribe } = aPushBrowser('granted');
  const sent = fakeApi({
    'GET /api/reminders': { publicKey: clubKey, devices: [] },
    'PUT /api/reminders': { id: 'f'.repeat(64), hour: 19 },
  });
  renderInApp(<NotificationSettings />, { path: '/reglages/notifications' });
  const reminder = await screen.findByRole('switch', { name: 'Rappel quotidien' });
  await vi.waitFor(() => expect(reminder).not.toHaveAttribute('aria-disabled'));
  await userEvent.click(reminder);
  await vi.waitFor(() =>
    expect(writes(sent)).toEqual([
      {
        method: 'PUT',
        path: '/api/reminders',
        body: { subscription: { endpoint, keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } }, hour: 19 },
      },
    ]),
  );
  expect(subscribe).toHaveBeenCalledOnce();
});
