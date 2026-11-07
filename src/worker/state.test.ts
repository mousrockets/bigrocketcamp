import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, test } from 'vitest';
import type { BoardChanges } from '../lib/board';
import { joinTestClub } from '../lib/club-fixture';
import { sha256 } from './auth';
import { alicePlayerId, livePayload } from './live-fixture';

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

describe('an open board follows what the collector and the rank source send, without a reload', () => {
  const rankKey = 'k'.repeat(40);

  beforeAll(async () => {
    (env as { RANK_SOURCE_KEY?: string }).RANK_SOURCE_KEY = rankKey;
    await env.DB.batch([
      env.DB.prepare('INSERT OR REPLACE INTO player_identities (slot, owner, player_id) VALUES (?, ?, ?)').bind(
        'alice',
        'member-alice',
        alicePlayerId,
      ),
      env.DB.prepare('INSERT OR REPLACE INTO player_identity_aliases VALUES (?, ?, ?, ?)').bind(
        alicePlayerId,
        'alice',
        'member-alice',
        'synthetic',
      ),
    ]);
  });

  async function openBoard(): Promise<number> {
    return (await (await board('?since=0')).json<{ version: number }>()).version;
  }

  async function changesSince(version: number): Promise<BoardChanges> {
    const answer = await board(`?since=${version}&wait=0`);
    expect(answer.status).toBe(200);
    return answer.json<BoardChanges>();
  }

  const reading = (mmr: number, matches: number, observedAt: string) =>
    exports.default.fetch('https://app.test/api/ranks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rank-Source-Key': rankKey },
      body: JSON.stringify({
        ranks: [{ player: 'alice', playerId: alicePlayerId, mmr, tier: 15, division: 2, matches, observedAt }],
      }),
    });

  test('a match: its result, so the history, the recap and the pushups due', async () => {
    const version = await openBoard();
    const sent = await exports.default.fetch('https://app.test/api/live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'https://app.test' },
      body: JSON.stringify(livePayload({ guid: 'synthetic-state-match' })),
    });
    expect(sent.status).toBe(200);
    const changes = await changesSince(version);
    expect(changes.results).toContainEqual(
      expect.objectContaining({ match_guid: 'synthetic-state-match', name: 'alice', team: 0, winner: 0 }),
    );
  });

  test('a forfeit: the same match sent again with its clock tells the open board how it ended', async () => {
    const guid = 'synthetic-state-forfeit';
    const send = (clock = {}) =>
      exports.default.fetch('https://app.test/api/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: 'https://app.test' },
        body: JSON.stringify(livePayload({ guid, clock })),
      });
    expect((await send()).status).toBe(200);
    const version = await openBoard();
    expect((await send({ TimeSeconds: 143, bOvertime: false })).status).toBe(200);
    const changes = await changesSince(version);
    expect(changes.results).toContainEqual(
      expect.objectContaining({ match_guid: guid, name: 'alice', forfeit: true, overtime: false }),
    );
  });

  test('a reading: rank, rating, season peak, matches played and the month standings', async () => {
    const version = await openBoard();
    const first = new Date().toISOString();
    expect((await reading(1234, 321, first)).status).toBe(200);
    const changes = await changesSince(version);
    expect(changes.doublesRanks.find((rank) => rank.player === 'alice')).toMatchObject({
      mmr: 1234,
      matchesPlayed: 321,
      fetchedAt: first,
      peak: { mmr: 1234 },
    });
    expect(changes.monthly.current.rows.find((row) => row.player === 'alice')).toMatchObject({ mmr: 1234 });

    // An unchanged rating still tells the board when it was last read.
    const again = new Date(Date.parse(first) + 60_000).toISOString();
    expect((await reading(1234, 321, again)).status).toBe(200);
    const unchanged = await changesSince(changes.version);
    expect(unchanged.doublesRanks.find((rank) => rank.player === 'alice')).toMatchObject({ fetchedAt: again });
  });
});
