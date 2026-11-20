import type { ReminderPush } from '../../lib/reminder-messages';

// The daily reminder on the device (src/worker/reminders.ts sends it): the service worker shows it, opens its page
// on a tap, and « Ne plus me rappeler » turns it off without opening the app.

export const stopAction = 'stop';
export const optOutPath = '/api/reminders/stop';

const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/** The reminder a push carries; null for anything else, which shows nothing. */
export function reminderOf(data: unknown): ReminderPush | null {
  if (typeof data !== 'object' || data === null) return null;
  const { title, body, url, tag } = data as Record<string, unknown>;
  // Only a page of the app opens: the club sends paths, never another site.
  if (!isText(title) || !isText(body) || !isText(tag) || !isText(url) || !url.startsWith('/') || url.startsWith('//'))
    return null;
  return { title, body, url, tag };
}

/** A notification's button: TypeScript's worker types leave it out, the browsers that offer buttons read it. */
interface NotificationButton {
  action: string;
  title: string;
}

/** The notification as the device shows it; « Ne plus me rappeler » where the system offers buttons. */
export function notificationOf(push: ReminderPush): [string, NotificationOptions & { actions: NotificationButton[] }] {
  return [
    push.title,
    {
      body: push.body,
      tag: push.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-64.png',
      data: { url: push.url },
      actions: [{ action: stopAction, title: 'Ne plus me rappeler' }],
    },
  ];
}

const base64Url = (buffer: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

/** What proves to the API that this device is the one subscribed: its endpoint and its secret, never in the URL. */
export function optOutOf(subscription: Pick<PushSubscription, 'endpoint' | 'getKey'>): {
  endpoint: string;
  auth: string;
} | null {
  const auth = subscription.getKey('auth');
  return auth ? { endpoint: subscription.endpoint, auth: base64Url(auth) } : null;
}
