import { buildPushPayload, type VapidKeys, vapidHeaders } from '@block65/webcrypto-web-push';
import { parisDay } from '../lib/days';
import type { Database } from '../lib/db';
import { type ReminderPush, reminderPush, reminderTag } from '../lib/reminder-messages';
import {
  type DueReminder,
  dueReminders,
  forgetIdleReminders,
  forgetReminders,
  readDebts,
  readMemberDevice,
  recordSent,
} from '../lib/reminders';
import { sessionLifetime } from './auth';

// Sends the daily reminder with Web Push: each notification is signed with the club's VAPID key (RFC 8292) and
// encrypted for its device alone (RFC 8291), by @block65/webcrypto-web-push on the Workers' WebCrypto. The hourly
// task (index.ts) sends those whose hour has come. Logs name a status, never an endpoint nor a key.

/**
 * At most this many notifications per run: each is a request to a push service, and the free plan allows 50 per
 * invocation. Devices past it go with the next hour's run.
 */
export const reminderBatch = 40;
/** A member who has not opened the app for this long stops receiving reminders. */
export const idleAfterMs = 90 * 24 * 60 * 60 * 1000;
/** A reminder a device could not receive within this time is dropped by the push service: tomorrow brings another. */
const reminderTtlSeconds = 4 * 60 * 60;

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export type Delivery = 'sent' | 'gone' | 'failed';

/** The instance's VAPID keys; null while one of them is missing: the reminder is then off. */
export function vapidOf(env: Env): VapidKeys | null {
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = env;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

/** Whether the keys sign at all: wrong keys must not pass for subscriptions gone, which would be erased. */
async function signs(vapid: VapidKeys): Promise<boolean> {
  try {
    await vapidHeaders(
      { endpoint: 'https://push.invalid/', expirationTime: null, keys: { p256dh: '', auth: '' } },
      vapid,
    );
    return true;
  } catch {
    console.error('the VAPID keys do not sign: no reminder sent');
    return false;
  }
}

/** Sends one notification. The push service answers 404 or 410 for a subscription it no longer knows. */
export async function deliver(
  device: Pick<DueReminder, 'endpoint' | 'p256dh' | 'auth'>,
  push: ReminderPush,
  vapid: VapidKeys,
  fetcher: Fetcher = fetch,
): Promise<Delivery> {
  let request: Awaited<ReturnType<typeof buildPushPayload>>;
  try {
    request = await buildPushPayload(
      { data: JSON.stringify(push), options: { ttl: reminderTtlSeconds, urgency: 'normal', topic: reminderTag } },
      { endpoint: device.endpoint, expirationTime: null, keys: { p256dh: device.p256dh, auth: device.auth } },
      vapid,
    );
  } catch {
    // The keys sign (checked first): the device's own keys cannot be encrypted for. It will never receive one.
    console.error('push subscription unusable');
    return 'gone';
  }
  try {
    const response = await fetcher(device.endpoint, { method: 'POST', headers: request.headers, body: request.body });
    await response.body?.cancel();
    if (response.ok) return 'sent';
    if (response.status === 404 || response.status === 410) return 'gone';
    console.error('push refused', response.status);
    return 'failed';
  } catch (error) {
    console.error('push service unreachable', (error as Error).name);
    return 'failed';
  }
}

/**
 * The hourly run: forgets the members gone idle, then sends each device whose hour has come today its reminder.
 * A device sent nothing (a push service down) is tried again at the next run, the same day.
 */
export async function sendDailyReminders(env: Env, now: number = Date.now(), fetcher: Fetcher = fetch) {
  const db: Database = env.DB;
  await forgetIdleReminders(db, now + sessionLifetime - idleAfterMs);
  const vapid = vapidOf(env);
  if (!vapid) return;
  const due = await dueReminders(db, now, reminderBatch);
  if (!due.length || !(await signs(vapid))) return;
  const debts = await readDebts(db, now);
  const day = parisDay(now);
  const outcomes = await Promise.all(
    due.map(async (device) => {
      const debt = debts.get(device.player) ?? 0;
      const push = reminderPush({ memberId: device.memberId, day, debt, lastDebt: device.lastDebt });
      return { id: device.id, debt, outcome: await deliver(device, push, vapid, fetcher) };
    }),
  );
  await recordSent(
    db,
    outcomes.filter(({ outcome }) => outcome === 'sent').map(({ id, debt }) => ({ id, day, debt })),
  );
  await forgetReminders(
    db,
    outcomes.filter(({ outcome }) => outcome === 'gone').map(({ id }) => id),
  );
}

const withStatus = (message: string, status: number) => Object.assign(new Error(message), { status });

/** « M’envoyer un rappel »: today's reminder, now, to one of the member's devices; tomorrow's is not changed. */
export async function sendTestReminder(env: Env, memberId: string, id: string, fetcher: Fetcher = fetch) {
  const vapid = vapidOf(env);
  if (!vapid) throw withStatus('Les rappels ne sont pas encore activés sur ce club.', 503);
  const device = await readMemberDevice(env.DB, memberId, id);
  if (!device) throw withStatus('Cet appareil ne reçoit pas de rappel.', 404);
  if (!(await signs(vapid))) throw withStatus('Les rappels sont mal configurés sur ce club.', 503);
  const debt = (await readDebts(env.DB)).get(device.player) ?? 0;
  const push = reminderPush({ memberId, day: parisDay(), debt, lastDebt: device.lastDebt });
  const outcome = await deliver(device, push, vapid, fetcher);
  if (outcome === 'gone') {
    await forgetReminders(env.DB, [device.id]);
    throw withStatus('Cet appareil ne reçoit plus les rappels : réactive-les.', 410);
  }
  if (outcome === 'failed')
    throw withStatus('Le service de notifications n’a pas répondu. Réessaie dans un instant.', 502);
}
