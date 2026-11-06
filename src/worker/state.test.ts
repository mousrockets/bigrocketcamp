import { env, exports } from 'cloudflare:workers';
import { beforeAll, expect, test } from 'vitest';
import { joinTestClub } from '../lib/club-fixture';
import { sha256 } from './auth';

let cookie = '';

beforeAll(async () => {
  await joinTestClub(env.DB);
  const token = `session-${crypto.randomUUID()}`;
  await env.DB.prepare('INSERT INTO sessions (token_hash, member_id, expires) VALUES (?, ?, ?)')
    .bind(await sha256(token), 'member-alice', Date.now() + 60_000)
    .run();
  cookie = `session=${token}`;
});

const board = (query = '', headers: Record<string, string> = {}) =>
  exports.default.fetch(`https://app.test/api/state${query}`, { headers: { Cookie: cookie, ...headers } });

test('an older page receives the whole board, then an empty 304 while nothing changes', async () => {
  const first = await board();
  expect(first.status).toBe(200);
  const body = await first.json<Record<string, unknown>>();
  expect(Object.keys(body)).toEqual(
    expect.arrayContaining(['results', 'exercises', 'collectors', 'matchRosters', 'reliability', 'reactions', 'me']),
  );
  const etag = first.headers.get('etag') ?? '';
  expect(etag).not.toBe('');
  const again = await board('', { 'If-None-Match': etag });
  expect(again.status).toBe(304);

  await env.DB.prepare(
    "INSERT INTO exercises (id, player, count, day, created, author, type) VALUES ('exercise-state-test-1', 'alice', 5, '2026-11-05', '2026-11-05T20:00:00.000Z', 'member-alice', 'pushups')",
  ).run();
  const changed = await board('', { 'If-None-Match': etag });
  expect(changed.status).toBe(200);
  const exercises = (await changed.json<{ exercises: { id: string; mine: boolean }[] }>()).exercises;
  expect(exercises).toContainEqual(expect.objectContaining({ id: 'exercise-state-test-1', mine: true }));
});

test('an open board receives only the changes, and nothing when nothing changed', async () => {
  const opened = await board('?since=0');
  const { version, more, reset } = await opened.json<{ version: number; more: boolean; reset: boolean }>();
  expect({ more, reset }).toEqual({ more: false, reset: true });

  const idle = await board(`?since=${version}&wait=0`);
  expect(idle.status).toBe(204);

  await env.DB.prepare(
    "INSERT INTO exercises (id, player, count, day, created, author, type) VALUES ('exercise-state-test-2', 'bob', 5, '2026-11-05', '2026-11-05T20:01:00.000Z', 'member-bob', 'pushups')",
  ).run();
  const changes = await board(`?since=${version}&wait=0`);
  expect(changes.status).toBe(200);
  const body = await changes.json<{ version: number; reset: boolean; exercises: { id: string; mine: boolean }[] }>();
  expect(body.reset).toBe(false);
  expect(body.version).toBeGreaterThan(version);
  expect(body.exercises).toEqual([expect.objectContaining({ id: 'exercise-state-test-2', mine: false })]);
});

test('a version from another database starts the board over', async () => {
  const answer = await board('?since=999999999');
  expect((await answer.json<{ reset: boolean }>()).reset).toBe(true);
});

test('a malformed version is refused', async () => {
  const answer = await board('?since=-1');
  expect(answer.status).toBe(400);
  expect(await answer.json()).toEqual({ error: 'Version du tableau invalide.' });
});
