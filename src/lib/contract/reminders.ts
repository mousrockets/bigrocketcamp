import { says, z } from '../validation';
import type { Known } from './shared';

// The daily reminder: a device subscribes with Web Push, at an hour of its choice, and turns it off whenever it wants.

export const invalidReminder = 'Abonnement aux notifications invalide.';
export const unknownReminder = 'Cet appareil ne reçoit pas de rappel.';
export const remindersOff = 'Les rappels ne sont pas encore activés sur ce club : un admin doit les configurer.';

/** Web Push keys, written in URL-safe base64 as `PushSubscription.toJSON()` gives them. */
const base64Url = (min: number, max: number) =>
  z
    .string(says(invalidReminder))
    .min(min, says(invalidReminder))
    .max(max, says(invalidReminder))
    .regex(/^[A-Za-z0-9_-]+={0,2}$/, says(invalidReminder));

/** The address of the push service for this device: https only, as RFC 8030 asks. */
const endpoint = z.url({ protocol: /^https$/, error: invalidReminder }).max(2000, says(invalidReminder));
/** The secret shared by the device and the club only: the push service never sees it. */
const authSecret = base64Url(22, 24);

export const pushSubscriptionInput = z.object({
  endpoint,
  // A P-256 public key (65 bytes) and a 16-byte secret.
  keys: z.object({ p256dh: base64Url(86, 88), auth: authSecret }, says(invalidReminder)),
});

export const reminderHour = z
  .int(says('Choisis une heure.'))
  .min(0, says('Choisis une heure.'))
  .max(23, says('Choisis une heure.'));

export const reminderInput = z.object({ subscription: pushSubscriptionInput, hour: reminderHour });
export type ReminderInput = z.input<typeof reminderInput>;

/** A device of the member, by the SHA-256 of its endpoint (see reminder-device.ts). */
export const reminderDeviceId = z.object({
  id: z.string(says(unknownReminder)).regex(/^[0-9a-f]{64}$/, says(unknownReminder)),
});
export type ReminderDeviceId = z.input<typeof reminderDeviceId>;

/**
 * « Ne plus me rappeler », from the notification itself: no session is needed, the device proves it is the one
 * subscribed with the secret only it and the club know. Sent in the body, never in the address.
 */
export const reminderOptOut = z.object({ endpoint, auth: authSecret });
export type ReminderOptOut = z.input<typeof reminderOptOut>;

export const reminderDevice = z.looseObject({ id: z.string(), hour: z.number() });
export type ReminderDevice = Known<z.output<typeof reminderDevice>>;

export const reminderSettings = z.looseObject({
  /** The club's VAPID public key, which a device subscribes with; null while the instance has none. */
  publicKey: z.string().nullable(),
  /** The member's devices that receive the reminder. */
  devices: z.array(reminderDevice),
});
export type ReminderSettings = Known<z.output<typeof reminderSettings>>;
