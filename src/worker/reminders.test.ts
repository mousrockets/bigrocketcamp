import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { reminderDeviceIdOf } from '../lib/reminder-device';
import { reminderMessages } from '../lib/reminder-messages';
import { saveReminder } from '../lib/reminders';
import { app } from './app';
import { reminderBatch, sendDailyReminders } from './reminders';

// The daily reminder, from the switch in Réglages to the notification a device decrypts.

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

// The Workers' types widen what WebCrypto returns; for a P-256 pair, it is a pair, and a raw export is bytes.
const p256Pair = (name: 'ECDH' | 'ECDSA', usages: string[]) =>
  crypto.subtle.generateKey({ name, namedCurve: 'P-256' }, true, usages) as Promise<CryptoKeyPair>;
const rawBytes = async (key: CryptoKey) => new Uint8Array((await crypto.subtle.exportKey('raw', key)) as ArrayBuffer);

/** The instance's VAPID keys, as `scripts/vapid-keys.ts` makes them. */
async function vapidKeys() {
  const pair = await p256Pair('ECDSA', ['sign', 'verify']);
  const { d } = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  if (!d) throw new Error('The private key has no d.');
  return { publicKey: base64Url(await rawBytes(pair.publicKey)), privateKey: d };
}

const origin = 'http://localhost';
const vapid = await vapidKeys();
const withKeys: Env = {
  ...env,
  VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
  VAPID_SUBJECT: 'mailto:admin@example.com',
};
/** 19 h 05 in Paris, when the hourly task runs. */
const at19 = Date.parse('2026-11-20T18:05:00Z');
const day = 86_400_000;

/** A browser's push subscription: its own key pair and secret, as PushManager makes them. */
async function aDevice(name: string) {
  const keys = await p256Pair('ECDH', ['deriveBits']);
  const publicKey = await rawBytes(keys.publicKey);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const subscription = {
    endpoint: `https://push.example.com/send/${name}`,
    keys: { p256dh: base64Url(publicKey), auth: base64Url(auth) },
  };
  return {
    subscription,
    privateKey: keys.privateKey,
    publicKey,
    auth,
    id: await reminderDeviceIdOf(subscription.endpoint),
  };
}
type Device = Awaited<ReturnType<typeof aDevice>>;

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, data));
}
const join = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap((part) => [...part]));
const text = (value: string) => new TextEncoder().encode(value);

/** What the device reads: the body decrypted as RFC 8291 says, with its own private key and secret. */
async function decrypt(device: Device, body: Uint8Array): Promise<{ title: string; body: string; url: string }> {
  const salt = body.slice(0, 16);
  const keyLength = body[20] ?? 0;
  const serverKey = body.slice(21, 21 + keyLength);
  const server = await crypto.subtle.importKey('raw', serverKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  // The Workers' types spell the peer key `$public`, a C++ escape; the runtime reads `public`, as the standard says.
  const ecdh = { name: 'ECDH', public: server } as SubtleCryptoDeriveKeyAlgorithm;
  const secret = new Uint8Array(await crypto.subtle.deriveBits(ecdh, device.privateKey, 256));
  const prkKey = await hmac(device.auth, secret);
  const ikm = await hmac(prkKey, join(text('WebPush: info\0'), device.publicKey, serverKey, Uint8Array.of(1)));
  const prk = await hmac(salt, ikm.slice(0, 32));
  const cek = (await hmac(prk, join(text('Content-Encoding: aes128gcm\0'), Uint8Array.of(1)))).slice(0, 16);
  const nonce = (await hmac(prk, join(text('Content-Encoding: nonce\0'), Uint8Array.of(1)))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const padded = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, body.slice(21 + keyLength)),
  );
  return JSON.parse(new TextDecoder().decode(padded.slice(0, padded.lastIndexOf(2))));
}

interface Sent {
  url: string;
  headers: Headers;
  body: Uint8Array;
}

/** The push services: each request is kept, and answered with the status the test chooses. */
function pushServices(status: (url: string) => number = () => 201) {
  const sent: Sent[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    sent.push({ url, headers: new Headers(init.headers), body: new Uint8Array(init.body as Uint8Array) });
    return new Response(null, { status: status(url) });
  };
  return { sent, fetcher };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A session in use, as the app keeps it: valid a year after the last visit. */
async function sessionOf(memberId: string, lastVisit = Date.now()): Promise<string> {
  const token = `token-${memberId}-${crypto.randomUUID()}`;
  await env.DB.prepare('INSERT INTO sessions (token_hash, member_id, expires) VALUES (?, ?, ?)')
    .bind(await sha256(token), memberId, lastVisit + 365 * day)
    .run();
  return `session=${token}`;
}

function call(path: string, cookie: string | null, method = 'GET', body?: unknown, keys: Env = withKeys) {
  const headers: Record<string, string> = { Origin: origin, 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const init = { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
  return app.fetch(new Request(`${origin}/api${path}`, init), keys);
}

const subscriptionCount = async () => env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').first<number>('n');

async function lost(id: string, player: string, minutesAgo = 600) {
  await env.DB.prepare(
    `INSERT INTO match_results (match_guid, player_id, name, day, kind, team, winner, score, goals, assists, saves,
      received, review_required, verification, source_types, selected_source)
     VALUES (?, ?, ?, '2026-11-20', 'match', 0, 1, 250, 0, 0, 0, ?, 0, 'single', 'collector', 'collector')`,
  )
    .bind(id, `Epic|${player}|0`, player, new Date(at19 - minutesAgo * 60_000).toISOString())
    .run();
}

async function pushups(id: string, player: string, count: number, author: string) {
  await env.DB.prepare(
    "INSERT INTO exercises (id, player, count, day, created, author, type) VALUES (?, ?, ?, '2026-11-20', ?, ?, 'pushups')",
  )
    .bind(id, player, count, new Date(at19).toISOString(), author)
    .run();
}

let alice: string;
let bob: string;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM push_subscriptions'),
    env.DB.prepare('DELETE FROM sessions'),
    env.DB.prepare('DELETE FROM exercises'),
    env.DB.prepare('DELETE FROM match_results'),
    env.DB.prepare('DELETE FROM members'),
    env.DB.prepare(
      "INSERT INTO members (id, email, role, duo_pseudo, platform, roster_position) VALUES ('member-alice', 'alice@example.com', 'admin', 'alice', 'pc', 1), ('member-bob', 'bob@example.com', 'member', 'bob', 'xbox', 2)",
    ),
  ]);
  alice = await sessionOf('member-alice');
  bob = await sessionOf('member-bob');
});

/** Subscribes a device for a member, as the switch in Réglages does. */
async function turnOn(cookie: string, device: Device, hour = 19) {
  const response = await call('/reminders', cookie, 'PUT', { subscription: device.subscription, hour });
  expect(response.status).toBe(200);
  return response;
}

describe('the switch in Réglages', () => {
  test('turns the reminder on for this device, at the hour chosen', async () => {
    const phone = await aDevice('alice-phone');
    expect(await (await turnOn(alice, phone, 21)).json()).toEqual({ id: phone.id, hour: 21 });
    const settings = await (await call('/reminders', alice)).json();
    expect(settings).toEqual({ publicKey: vapid.publicKey, devices: [{ id: phone.id, hour: 21 }] });
    // Another hour later on: the same device, its hour changed.
    await turnOn(alice, phone, 8);
    expect(await (await call('/reminders', alice)).json()).toMatchObject({ devices: [{ id: phone.id, hour: 8 }] });
    // Each member sees only their own devices.
    expect(await (await call('/reminders', bob)).json()).toMatchObject({ devices: [] });
  });

  test('turns it off: the subscription is erased from the server', async () => {
    const phone = await aDevice('alice-phone');
    await turnOn(alice, phone);
    expect((await call('/reminders', bob, 'DELETE', { id: phone.id })).status).toBe(200);
    expect(await subscriptionCount()).toBe(1);
    expect((await call('/reminders', alice, 'DELETE', { id: phone.id })).status).toBe(200);
    expect(await subscriptionCount()).toBe(0);
    expect(await (await call('/reminders', alice)).json()).toMatchObject({ devices: [] });
  });

  test('refuses what is not a push subscription, a session missing, or another site', async () => {
    const phone = await aDevice('alice-phone');
    const http = { ...phone.subscription, endpoint: 'http://push.example.com/send/1' };
    expect((await call('/reminders', alice, 'PUT', { subscription: http, hour: 19 })).status).toBe(400);
    expect((await call('/reminders', alice, 'PUT', { subscription: phone.subscription, hour: 24 })).status).toBe(400);
    expect((await call('/reminders', null, 'PUT', { subscription: phone.subscription, hour: 19 })).status).toBe(401);
    const elsewhere = await app.fetch(
      new Request(`${origin}/api/reminders`, {
        method: 'PUT',
        headers: { Origin: 'https://evil.example', Cookie: alice, 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: phone.subscription, hour: 19 }),
      }),
      withKeys,
    );
    expect(elsewhere.status).toBe(403);
  });

  test('says the reminder is off while the instance has no VAPID keys', async () => {
    const phone = await aDevice('alice-phone');
    expect(await (await call('/reminders', alice, 'GET', undefined, env)).json()).toEqual({
      publicKey: null,
      devices: [],
    });
    const refused = await call('/reminders', alice, 'PUT', { subscription: phone.subscription, hour: 19 }, env);
    expect(refused.status).toBe(503);
    expect(await refused.json()).toEqual({ error: expect.stringContaining('pas encore activés') });
    const services = pushServices();
    await sendDailyReminders(env, at19, services.fetcher);
    expect(services.sent).toEqual([]);
  });
});

describe('« Ne plus me rappeler » in the notification', () => {
  test('stops the reminder with the subscription’s own secret, without a session', async () => {
    const phone = await aDevice('alice-phone');
    const other = await aDevice('someone-else');
    await turnOn(alice, phone);
    const { endpoint } = phone.subscription;
    // Knowing the endpoint is not enough: the push service knows it too.
    expect((await call('/reminders/stop', null, 'POST', { endpoint, auth: other.subscription.keys.auth })).status).toBe(
      200,
    );
    expect(await subscriptionCount()).toBe(1);
    expect((await call('/reminders/stop', null, 'POST', { endpoint, auth: phone.subscription.keys.auth })).status).toBe(
      200,
    );
    expect(await subscriptionCount()).toBe(0);
    // The switch in Réglages reads it off.
    expect(await (await call('/reminders', alice)).json()).toMatchObject({ devices: [] });
  });

  test('is refused from another site, and to a body without the secret', async () => {
    const phone = await aDevice('alice-phone');
    await turnOn(alice, phone);
    const fromElsewhere = await app.fetch(
      new Request(`${origin}/api/reminders/stop`, {
        method: 'POST',
        headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: phone.subscription.endpoint, auth: phone.subscription.keys.auth }),
      }),
      withKeys,
    );
    expect(fromElsewhere.status).toBe(403);
    expect((await call('/reminders/stop', null, 'POST', { endpoint: phone.subscription.endpoint })).status).toBe(400);
    expect(await subscriptionCount()).toBe(1);
  });
});

describe('the hourly task', () => {
  test('sends each member, once a day at their hour, the debt the app shows', async () => {
    await lost('m1', 'alice');
    await lost('m2', 'alice');
    await pushups('ex-alice-0000001', 'alice', 3, 'member-alice');
    const alicePhone = await aDevice('alice-phone');
    const bobPhone = await aDevice('bob-phone');
    const bobLate = await aDevice('bob-late');
    await turnOn(alice, alicePhone);
    await turnOn(bob, bobPhone);
    await turnOn(bob, bobLate, 22);
    await env.DB.prepare('UPDATE push_subscriptions SET last_sent_day = NULL').run();

    const services = pushServices();
    await sendDailyReminders(withKeys, at19, services.fetcher);
    expect(services.sent.map((request) => request.url).sort()).toEqual([
      alicePhone.subscription.endpoint,
      bobPhone.subscription.endpoint,
    ]);
    const [toAlice, toBob] = [alicePhone, bobPhone].map((device) =>
      services.sent.find((request) => request.url === device.subscription.endpoint),
    );
    expect(toAlice?.headers.get('content-encoding')).toBe('aes128gcm');
    expect(toAlice?.headers.get('authorization')).toMatch(new RegExp(`^vapid t=.+, k=${vapid.publicKey}$`));

    // As L'équipe counts it: two defeats, 5 each, less the 3 pushups done.
    const forAlice = await decrypt(alicePhone, toAlice?.body ?? new Uint8Array());
    expect(forAlice).toMatchObject({ title: '7 pompes à rendre', url: '/?declarer=true' });
    expect(reminderMessages.small).toContain(forAlice.body);
    const forBob = await decrypt(bobPhone, toBob?.body ?? new Uint8Array());
    expect(forBob).toMatchObject({ title: 'C’est bon pour aujourd’hui', url: '/' });
    expect(reminderMessages.cleared).toContain(forBob.body);

    // One a day: the next hour sends nothing more to them.
    const later = pushServices();
    await sendDailyReminders(withKeys, at19 + 60 * 60_000, later.fetcher);
    expect(later.sent).toEqual([]);
    // 22 h is bob's other device.
    await sendDailyReminders(withKeys, at19 + 3 * 60 * 60_000, later.fetcher);
    expect(later.sent.map((request) => request.url)).toEqual([bobLate.subscription.endpoint]);
  });

  test('says the next day how much the debt grew', async () => {
    const phone = await aDevice('alice-phone');
    await turnOn(alice, phone);
    await env.DB.prepare('UPDATE push_subscriptions SET last_sent_day = NULL').run();
    await lost('m1', 'alice');
    await sendDailyReminders(withKeys, at19, pushServices().fetcher);
    await lost('m2', 'alice');
    await lost('m3', 'alice');
    const services = pushServices();
    await sendDailyReminders(withKeys, at19 + day, services.fetcher);
    const notification = await decrypt(phone, services.sent[0]?.body ?? new Uint8Array());
    expect(notification.title).toBe('15 pompes à rendre');
    expect(notification.body).toContain('10 pompes');
  });

  test('erases a subscription the push service no longer knows, and tries a failed one again', async () => {
    const gone = await aDevice('gone');
    const down = await aDevice('down');
    await turnOn(alice, gone);
    await turnOn(bob, down);
    await env.DB.prepare('UPDATE push_subscriptions SET last_sent_day = NULL').run();
    const services = pushServices((url) => (url.endsWith('/gone') ? 410 : 503));
    await sendDailyReminders(withKeys, at19, services.fetcher);
    expect(services.sent).toHaveLength(2);
    const left = await env.DB.prepare('SELECT id FROM push_subscriptions').all<{ id: string }>();
    expect(left.results).toEqual([{ id: down.id }]);
    const again = pushServices();
    await sendDailyReminders(withKeys, at19 + 60 * 60_000, again.fetcher);
    expect(again.sent.map((request) => request.url)).toEqual([down.subscription.endpoint]);
  });

  test('does not send a reminder late on the day it is turned on', async () => {
    const phone = await aDevice('alice-phone');
    // Turned on at 19 h for 8 h: the first one comes tomorrow at 8 h.
    await saveReminder(env.DB, 'member-alice', { subscription: phone.subscription, hour: 8 }, at19);
    const services = pushServices();
    await sendDailyReminders(withKeys, at19, services.fetcher);
    expect(services.sent).toEqual([]);
    await sendDailyReminders(withKeys, Date.parse('2026-11-21T07:05:00Z'), services.fetcher);
    expect(services.sent.map((request) => request.url)).toEqual([phone.subscription.endpoint]);
  });

  test('sends at most a batch per run, the rest at the next one', async () => {
    const devices = await Promise.all(Array.from({ length: reminderBatch + 3 }, (_, index) => aDevice(`d${index}`)));
    await env.DB.batch(
      devices.map((device) =>
        env.DB.prepare(
          "INSERT INTO push_subscriptions (id, member_id, endpoint, p256dh, auth, hour) VALUES (?, 'member-alice', ?, ?, ?, 19)",
        ).bind(device.id, device.subscription.endpoint, device.subscription.keys.p256dh, device.subscription.keys.auth),
      ),
    );
    const first = pushServices();
    await sendDailyReminders(withKeys, at19, first.fetcher);
    expect(first.sent).toHaveLength(reminderBatch);
    const next = pushServices();
    await sendDailyReminders(withKeys, at19 + 60 * 60_000, next.fetcher);
    expect(next.sent).toHaveLength(3);
  });

  test('erases the reminders of a member who has not opened the app for 90 days', async () => {
    const phone = await aDevice('bob-phone');
    await turnOn(bob, phone);
    await env.DB.prepare("DELETE FROM sessions WHERE member_id = 'member-bob'").run();
    await sessionOf('member-bob', Date.now() - 91 * day);
    await sendDailyReminders(withKeys, Date.now(), pushServices().fetcher);
    expect(await subscriptionCount()).toBe(0);
  });
});

describe('« M’envoyer un rappel »', () => {
  test('sends today’s reminder now to this device', async () => {
    const phone = await aDevice('alice-phone');
    await turnOn(alice, phone);
    expect((await call('/reminders/test', bob, 'POST', { id: phone.id })).status).toBe(404);
    expect((await call('/reminders/test', alice, 'POST', { id: phone.id }, env)).status).toBe(503);
    const services = pushServices();
    vi.stubGlobal('fetch', services.fetcher);
    try {
      expect((await call('/reminders/test', alice, 'POST', { id: phone.id })).status).toBe(200);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(await decrypt(phone, services.sent[0]?.body ?? new Uint8Array())).toMatchObject({
      title: 'C’est bon pour aujourd’hui',
    });
  });
});

test('a deleted account takes its reminders with it', async () => {
  await turnOn(bob, await aDevice('bob-phone'));
  expect((await call('/profile', bob, 'DELETE')).status).toBe(204);
  expect(await subscriptionCount()).toBe(0);
});
