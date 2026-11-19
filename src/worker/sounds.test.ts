import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, test } from 'vitest';
import { soundIds } from '../lib/sounds';

const origin = 'http://localhost';

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Opens a session for a member and returns its cookie. */
async function sessionOf(memberId: string): Promise<string> {
  const token = `token-${memberId}-${crypto.randomUUID()}`;
  await env.DB.prepare('INSERT INTO sessions (token_hash, member_id, expires) VALUES (?, ?, ?)')
    .bind(await sha256(token), memberId, Date.now() + 86_400_000)
    .run();
  return `session=${token}`;
}

function call(path: string, cookie: string | null, method = 'GET', body?: unknown) {
  const headers: Record<string, string> = { Origin: origin, 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  return exports.default.fetch(`${origin}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** A series of pushups declared by `author` for `player`, `minutesAgo` minutes ago. */
async function series(id: string, author: string, player: string, minutesAgo = 0) {
  await env.DB.prepare(
    "INSERT INTO exercises (id, player, count, day, created, author, type) VALUES (?, ?, 20, '2026-11-19', ?, ?, 'pushups')",
  )
    .bind(id, player, new Date(Date.now() - minutesAgo * 60_000).toISOString(), author)
    .run();
}

const draw = (cookie: string, exerciseId: string) => call('/api/sounds', cookie, 'POST', { exerciseId });

interface Collections {
  collections: { player: string; badges: { sound: string; count: number }[] }[];
}

let alice: string;
let bob: string;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sound_draws'),
    env.DB.prepare('DELETE FROM sessions'),
    env.DB.prepare('DELETE FROM exercises'),
    env.DB.prepare('DELETE FROM members'),
    env.DB.prepare(
      "INSERT INTO members (id, email, role, duo_pseudo, platform, roster_position) VALUES ('member-alice', 'alice@example.com', 'admin', 'alice', 'pc', 1), ('member-bob', 'bob@example.com', 'member', 'bob', 'xbox', 2)",
    ),
  ]);
  alice = await sessionOf('member-alice');
  bob = await sessionOf('member-bob');
});

describe('the sound badges', () => {
  test('a series that clears the debt wins a sound, the same one when asked again', async () => {
    await series('series-of-bob-0001', 'member-bob', 'bob');
    const first = await draw(bob, 'series-of-bob-0001');
    expect(first.status).toBe(200);
    const won = await first.json<{ sound: string; unlocked: boolean }>();
    expect(soundIds).toContain(won.sound);
    expect(won.unlocked).toBe(true);
    expect(await (await draw(bob, 'series-of-bob-0001')).json()).toEqual(won);
  });

  test('a sound drawn again is not a new badge, and counts twice in the collection', async () => {
    await series('series-of-bob-0001', 'member-bob', 'bob');
    await series('series-of-bob-0002', 'member-bob', 'bob');
    const { sound } = await (await draw(bob, 'series-of-bob-0001')).json<{ sound: string }>();
    // The second draw is forced onto the same sound, as chance sometimes does.
    await env.DB.prepare(
      "INSERT INTO sound_draws (exercise_id, member_id, sound) VALUES ('series-of-bob-0002', 'member-bob', ?)",
    )
      .bind(sound)
      .run();
    expect(await (await draw(bob, 'series-of-bob-0002')).json()).toEqual({ sound, unlocked: false });
    const response = await call('/api/sounds', alice);
    expect(await response.json<Collections>()).toEqual({
      collections: [{ player: 'bob', badges: [{ sound, count: 2 }] }],
    });
  });

  test('only the author of their own recent series draws', async () => {
    await series('series-of-bob-0001', 'member-bob', 'bob');
    await series('series-for-alice1', 'member-bob', 'alice');
    await series('series-of-bob-old1', 'member-bob', 'bob', 120);
    expect((await draw(alice, 'series-of-bob-0001')).status).toBe(404);
    expect((await draw(bob, 'series-for-alice1')).status).toBe(404);
    expect((await draw(bob, 'series-of-bob-old1')).status).toBe(403);
    expect((await draw(bob, 'unknown-series-0001')).status).toBe(404);
    expect((await call('/api/sounds', null)).status).toBe(401);
  });

  test('a series taken back takes its badge with it', async () => {
    await series('series-of-bob-0001', 'member-bob', 'bob');
    await draw(bob, 'series-of-bob-0001');
    expect((await call('/api/exercise', bob, 'DELETE', { id: 'series-of-bob-0001' })).status).toBe(200);
    expect(await (await call('/api/sounds', bob)).json()).toEqual({ collections: [] });
  });

  test('a deleted account takes its badges with it', async () => {
    await series('series-of-bob-0001', 'member-bob', 'bob');
    await draw(bob, 'series-of-bob-0001');
    expect((await call('/api/profile', bob, 'DELETE')).status).toBe(204);
    const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM sound_draws').first('n');
    expect(left).toBe(0);
  });
});
