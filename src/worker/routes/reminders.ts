import { Hono } from 'hono';
import {
  type Done,
  invalidReminder,
  type ReminderDevice,
  type ReminderSettings,
  reminderDeviceId,
  reminderInput,
  reminderOptOut,
  remindersOff,
  unknownReminder,
} from '../../lib/contract';
import { optOutOfReminders, readReminderDevices, saveReminder, stopReminder } from '../../lib/reminders';
import { type AppEnv, sameOriginOnly } from '../auth';
import { sendTestReminder, vapidOf } from '../reminders';
import { failure, noStore } from '../respond';
import { jsonBody } from '../validate';

// The daily reminder, as the member sets it on each device (Réglages → Notifications).

/** The subscription travels as JSON with its endpoint, a few hundred characters. */
const subscriptionBody = { invalid: invalidReminder, maxLength: 4000 };

export const reminderRoutes = new Hono<AppEnv>()
  .get('/', async (c) =>
    c.json(
      {
        publicKey: vapidOf(c.env)?.publicKey ?? null,
        devices: await readReminderDevices(c.env.DB, c.var.member.id),
      } satisfies ReminderSettings,
      200,
      noStore,
    ),
  )
  .put('/', sameOriginOnly, ...jsonBody(reminderInput, subscriptionBody), async (c) => {
    if (!vapidOf(c.env)) return c.json({ error: remindersOff }, 503, noStore);
    try {
      const device = await saveReminder(c.env.DB, c.var.member.id, c.req.valid('json'));
      return c.json(device satisfies ReminderDevice, 200, noStore);
    } catch (error) {
      return failure(c, error, invalidReminder);
    }
  })
  .delete('/', sameOriginOnly, ...jsonBody(reminderDeviceId, { invalid: unknownReminder }), async (c) => {
    // Already off (from the notification, or another device): the member's wish holds all the same.
    await stopReminder(c.env.DB, c.var.member.id, c.req.valid('json').id);
    return c.json({ ok: true } satisfies Done, 200, noStore);
  })
  .post('/test', sameOriginOnly, ...jsonBody(reminderDeviceId, { invalid: unknownReminder }), async (c) => {
    try {
      await sendTestReminder(c.env, c.var.member.id, c.req.valid('json').id);
      return c.json({ ok: true } satisfies Done, 200, noStore);
    } catch (error) {
      return failure(c, error, 'Envoi impossible.');
    }
  });

/**
 * « Ne plus me rappeler », sent by the service worker from the notification, without a session: the endpoint and
 * the subscription's secret, in the body, are the proof.
 */
export const reminderOptOutRoutes = new Hono<AppEnv>().post(
  '/',
  sameOriginOnly,
  ...jsonBody(reminderOptOut, subscriptionBody),
  async (c) => {
    // The same answer whether the device was subscribed or not: nothing to learn from trying.
    await optOutOfReminders(c.env.DB, c.req.valid('json'));
    return c.json({ ok: true } satisfies Done, 200, noStore);
  },
);
