import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, test } from 'vitest';
import { joinTestClub } from '../lib/club-fixture';
import { sha256 } from './auth';

const origin = 'http://localhost';
const memberId = 'member-alice';
const alicePlayerId = `Epic|${'b'.repeat(32)}|0`;

function call(path: string, init: { method?: string; body?: unknown; cookie?: string; token?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.cookie) {
    headers.Cookie = init.cookie;
    headers.Origin = origin;
  }
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  return exports.default.fetch(`${origin}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? null : JSON.stringify(init.body),
  });
}

async function signIn(): Promise<string> {
  const token = `session-${crypto.randomUUID()}`;
  await env.DB.prepare('INSERT INTO sessions (token_hash, member_id, expires) VALUES (?, ?, ?)')
    .bind(await sha256(token), memberId, Date.now() + 60_000)
    .run();
  return `session=${token}`;
}

async function newCode(cookie: string): Promise<string> {
  const response = await call('/api/collectors', { method: 'POST', cookie });
  expect(response.status).toBe(201);
  const { code } = await response.json<{ code: string }>();
  return code;
}

const pair = (code: string) => call('/api/collector/pair', { method: 'POST', body: { code } });

async function pairedToken(): Promise<string> {
  const response = await pair(await newCode(await signIn()));
  expect(response.status).toBe(200);
  const body = await response.json<{ token: string; player: string }>();
  expect(body.player).toBe('alice');
  return body.token;
}

function livePayload() {
  const now = Date.now();
  const players = [
    ['alice', alicePlayerId],
    ['Opponent 1', `Epic|${'d'.repeat(32)}|0`],
    ['Opponent 2', `Epic|${'e'.repeat(32)}|0`],
    ['Opponent 3', `Epic|${'f'.repeat(32)}|0`],
  ].map(([Name, PrimaryId], i) => ({
    Name,
    PrimaryId,
    TeamNum: i < 2 ? 0 : 1,
    Score: 100,
    Goals: 0,
    Assists: 0,
    Saves: 0,
  }));
  return {
    startedAt: now - 360_000,
    endedAt: now - 1000,
    seenIds: players.map((player) => player.PrimaryId),
    end: { MatchGuid: 'synthetic-collector-match', WinnerTeamNum: 0 },
    state: {
      MatchGuid: 'synthetic-collector-match',
      Players: players,
      Game: {
        PlaylistId: 11,
        Teams: [
          { Name: 'Blue', TeamNum: 0, Score: 2 },
          { Name: 'Orange', TeamNum: 1, Score: 1 },
        ],
        bHasWinner: true,
        bReplay: false,
        Winner: 'Blue',
      },
    },
  };
}

beforeEach(async () => {
  await env.DB.batch(
    [
      'collector_devices',
      'collector_pairing_codes',
      'sessions',
      'player_identities',
      'player_identity_aliases',
      'result_observations',
      'source_reports',
      'prototype_results',
      'prototype_match_rosters',
      'members',
    ].map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
  );
  await joinTestClub(env.DB);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO player_identities (slot, owner, player_id) VALUES (?, ?, ?)').bind(
      'alice',
      memberId,
      alicePlayerId,
    ),
    env.DB.prepare('INSERT INTO player_identity_aliases VALUES (?, ?, ?, ?)').bind(
      alicePlayerId,
      'alice',
      memberId,
      'synthetic',
    ),
  ]);
});

describe('pairing the Windows collector', () => {
  test('a code from the profile pairs a collector once, and only its hash is stored', async () => {
    const cookie = await signIn();
    const code = await newCode(cookie);
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    const stored = await env.DB.prepare('SELECT code_hash FROM collector_pairing_codes').first<{ code_hash: string }>();
    expect(stored?.code_hash).toBe(await sha256(code));

    const response = await pair(`${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`);
    expect(response.status).toBe(200);
    const { token, player } = await response.json<{ token: string; player: string }>();
    expect(player).toBe('alice');
    expect(token).toMatch(/^[\w-]{43}$/);
    const device = await env.DB.prepare('SELECT token_hash, member_id, last_seen FROM collector_devices').first();
    expect(device).toEqual({ token_hash: await sha256(token), member_id: memberId, last_seen: null });

    expect((await pair(code)).status).toBe(401);
  });

  test('an expired code is refused', async () => {
    const code = await newCode(await signIn());
    await env.DB.prepare('UPDATE collector_pairing_codes SET expires = ?')
      .bind(Date.now() - 1)
      .run();
    expect((await pair(code)).status).toBe(401);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM collector_devices').first('n')).toBe(0);
  });

  test('five wrong codes lock the pending code', async () => {
    const code = await newCode(await signIn());
    const wrong = code === 'AAAAAAAA' ? 'BBBBBBBB' : 'AAAAAAAA';
    for (let attempt = 0; attempt < 5; attempt++) expect((await pair(wrong)).status).toBe(401);
    expect((await pair(code)).status).toBe(401);
  });

  test('a malformed code is refused without counting as a guess', async () => {
    const code = await newCode(await signIn());
    for (let attempt = 0; attempt < 5; attempt++) expect((await pair('0O1lI')).status).toBe(400);
    expect((await pair(code)).status).toBe(200);
  });

  test('a code needs a session from the app itself', async () => {
    expect((await call('/api/collectors', { method: 'POST' })).status).toBe(401);
    const cookie = await signIn();
    const foreign = await exports.default.fetch(`${origin}/api/collectors`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: 'https://evil.example' },
    });
    expect(foreign.status).toBe(403);
  });
});

describe('sending with the collector token', () => {
  test('a match sent with the token is attributed to its member, without an Origin', async () => {
    const token = await pairedToken();
    const response = await call('/api/live', { method: 'POST', token, body: livePayload() });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, received: 4 });
    const names = await env.DB.prepare(
      "SELECT json_extract(payload, '$.name') AS name FROM result_observations ORDER BY name",
    ).all<{ name: string }>();
    expect(names.results.map((row) => row.name)).toContain('alice');
    const device = await env.DB.prepare('SELECT last_seen FROM collector_devices').first<{ last_seen: number }>();
    expect(device?.last_seen).toBeGreaterThan(Date.now() - 60_000);
  });

  test('the status names the player, and a revoked token is refused', async () => {
    const token = await pairedToken();
    const status = await call('/api/collector/status', { token });
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ player: 'alice' });

    const cookie = await signIn();
    const listed = await call('/api/collectors', { cookie });
    const { devices } = await listed.json<{ devices: { id: string; lastSeen: string | null }[] }>();
    expect(devices).toHaveLength(1);
    expect(devices[0]?.lastSeen).not.toBeNull();

    expect((await call('/api/collectors', { method: 'DELETE', cookie, body: { id: devices[0]?.id } })).status).toBe(
      204,
    );
    expect((await call('/api/collector/status', { token })).status).toBe(401);
    expect((await call('/api/live', { method: 'POST', token, body: livePayload() })).status).toBe(401);
  });

  test('an unknown token is refused, and a session still needs the app origin', async () => {
    expect((await call('/api/collector/status', { token: 'unknown' })).status).toBe(401);
    expect((await call('/api/collector/status')).status).toBe(401);
    const cookie = await signIn();
    const foreign = await exports.default.fetch(`${origin}/api/live`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: 'https://evil.example' },
      body: JSON.stringify(livePayload()),
    });
    expect(foreign.status).toBe(403);
  });

  test('a member cannot revoke the collector of another member', async () => {
    await pairedToken();
    const device = await env.DB.prepare('SELECT id FROM collector_devices').first<{ id: string }>();
    const bobSession = `session-${crypto.randomUUID()}`;
    await env.DB.prepare('INSERT INTO sessions (token_hash, member_id, expires) VALUES (?, ?, ?)')
      .bind(await sha256(bobSession), 'member-bob', Date.now() + 60_000)
      .run();
    const response = await call('/api/collectors', {
      method: 'DELETE',
      cookie: `session=${bobSession}`,
      body: { id: device?.id },
    });
    expect(response.status).toBe(404);
  });

  test('deleting the account removes its collectors', async () => {
    const token = await pairedToken();
    const cookie = await signIn();
    expect((await call('/api/profile', { method: 'DELETE', cookie })).status).toBe(204);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM collector_devices').first('n')).toBe(0);
    expect((await call('/api/collector/status', { token })).status).toBe(401);
  });
});
