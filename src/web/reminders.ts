import { queryOptions } from '@tanstack/react-query';
import { reminderDeviceIdOf } from '../lib/reminder-device';
import { isIos, isStandalone } from './settings/install';
import { saveReminder, stopReminder } from './writes';

// The daily reminder on this device: the browser's push subscription, which the API keeps to send it. The browser
// asks the member's permission first; the service worker (src/web/sw) shows what arrives.

/**
 * Whether this device can receive the reminder: `install` on an iPhone, where Web Push needs the app on the home
 * screen (iOS 16.4 and later).
 */
export type PushSupport = 'ready' | 'install' | 'unsupported';

export function pushSupport(): PushSupport {
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'ready';
  return isIos() && !isStandalone() ? 'install' : 'unsupported';
}

/** The member refused the notifications to this site, or the browser did for them. */
export const notificationsBlocked = (): boolean => 'Notification' in window && Notification.permission === 'denied';

export const blockedMessage =
  'Notifications bloquées : autorise-les pour ce site dans les réglages du navigateur (ou du téléphone pour l’app installée), puis réactive le rappel.';

export interface ThisDevice {
  /** Its name on the server: a SHA-256 of its endpoint. */
  id: string;
  subscription: PushSubscriptionJSON;
}

/** The service worker's registration: `ready` would wait forever for one that failed. */
const registration = async () => (pushSupport() === 'ready' ? navigator.serviceWorker.getRegistration() : undefined);

async function currentSubscription(): Promise<PushSubscription | null> {
  return (await (await registration())?.pushManager.getSubscription()) ?? null;
}

async function describe(subscription: PushSubscription): Promise<ThisDevice> {
  return { id: await reminderDeviceIdOf(subscription.endpoint), subscription: subscription.toJSON() };
}

/** This device's push subscription, if it has one; the API says whether it receives the reminder. */
export const thisDeviceQuery = queryOptions({
  queryKey: ['reminders', 'device'],
  queryFn: async (): Promise<ThisDevice | null> => {
    const subscription = await currentSubscription();
    return subscription ? describe(subscription) : null;
  },
  refetchOnWindowFocus: 'always',
});

const bytesOf = (base64Url: string) =>
  Uint8Array.from(atob(base64Url.replaceAll('-', '+').replaceAll('_', '/')), (character) => character.charCodeAt(0));

const sameKey = (key: ArrayBuffer | null, expected: Uint8Array) =>
  key !== null &&
  key.byteLength === expected.byteLength &&
  new Uint8Array(key).every((byte, i) => byte === expected[i]);

/** Asks the permission, subscribes this device with the club's key, then gives the API the subscription. */
export async function turnRemindersOn({ publicKey, hour }: { publicKey: string; hour: number }): Promise<void> {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error(blockedMessage);
  const pushManager = (await registration())?.pushManager;
  if (!pushManager) throw new Error('L’app n’est pas encore prête sur cet appareil : recharge la page.');
  const key = bytesOf(publicKey);
  let subscription = await pushManager.getSubscription();
  // Subscribed with another key (the club changed its own): only a new subscription receives.
  if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }).catch(() => {
    // The browser explains in English, if at all: the member reads what to do.
    throw new Error('Abonnement impossible sur cet appareil. Réessaie dans un instant.');
  });
  await saveReminder({ subscription: subscriptionInput(subscription.toJSON()), hour });
}

/** The subscription as the API reads it. */
export function subscriptionInput(subscription: PushSubscriptionJSON) {
  return {
    endpoint: subscription.endpoint ?? '',
    keys: { p256dh: subscription.keys?.p256dh ?? '', auth: subscription.keys?.auth ?? '' },
  };
}

/** Turns the reminder off: the API forgets the subscription, then the browser drops it. */
export async function turnRemindersOff(device: ThisDevice): Promise<void> {
  await stopReminder(device.id);
  await (await currentSubscription())?.unsubscribe();
}

/** Signing out: this device stops receiving the member's reminders; offline, the 90 days without a visit will. */
export async function forgetThisDevice(): Promise<void> {
  const subscription = await currentSubscription().catch(() => null);
  if (!subscription) return;
  const { id } = await describe(subscription);
  await stopReminder(id).catch(() => {});
  await subscription.unsubscribe().catch(() => false);
}
