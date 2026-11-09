import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, test } from 'vitest';
import { joinTestClub } from '../lib/club-fixture';
import { sha256 } from './auth';
import { alicePlayerId, livePayload } from './live-fixture';

const origin = 'http://localhost';
const memberId = 'member-alice';

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

beforeEach(async () => {
  await env.DB.batch(
    [
      'collectors',
      'collector_devices',
      'collector_pairing_codes',
      'sessions',
      'solo_mmr_entries',
      'solo_ranks',
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

  test("a match played with the member's solo account counts as theirs once the rank source found it", async () => {
    const soloId = `Epic|${'c'.repeat(32)}|0`;
    const token = await pairedToken();
    const payload = livePayload();
    payload.state.Players = payload.state.Players.map((player) =>
      player.Name === 'alice' ? { ...player, Name: 'Alice Solo', PrimaryId: soloId } : player,
    );
    payload.seenIds = payload.state.Players.map((player) => player.PrimaryId);
    const send = () => call('/api/live', { method: 'POST', token, body: payload });
    await env.DB.prepare("UPDATE members SET solo_pseudo = 'Alice Solo' WHERE id = ?").bind(memberId).run();
    expect((await send()).status).toBe(403);

    const sourceKey = 'k'.repeat(40);
    (env as { RANK_SOURCE_KEY?: string }).RANK_SOURCE_KEY = sourceKey;
    const reading = { player: 'alice', kind: 'solo', name: 'Alice Solo', playerId: soloId, mmr: 1200, tier: 16 };
    const found = await exports.default.fetch(`${origin}/api/ranks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Rank-Source-Key': sourceKey },
      body: JSON.stringify({ ranks: [{ ...reading, division: 2, observedAt: new Date().toISOString() }] }),
    });
    expect(found.status).toBe(200);

    expect((await send()).status).toBe(200);
    const names = await env.DB.prepare(
      "SELECT json_extract(payload, '$.name') AS name FROM result_observations WHERE player_id = ?",
    )
      .bind(soloId)
      .all<{ name: string }>();
    expect(names.results).toEqual([{ name: 'alice' }]);
  });

  test('the clock sent with a match tells how it ended, on every row; an older collector leaves it unknown', async () => {
    const token = await pairedToken();
    const clockTrace = [
      { TimeSeconds: 143, bOvertime: false, ended: false },
      { TimeSeconds: 0, bOvertime: false, ended: true },
    ];
    const forfeit = {
      ...livePayload({ guid: 'synthetic-forfeit', clock: { TimeSeconds: 143, bOvertime: false } }),
      clockTrace,
    };
    const overtime = livePayload({ guid: 'synthetic-overtime', clock: { TimeSeconds: 41, bOvertime: true } });
    for (const body of [forfeit, overtime, livePayload({ guid: 'synthetic-older' })]) {
      expect((await call('/api/live', { method: 'POST', token, body })).status).toBe(200);
    }
    const reports = await env.DB.prepare(
      'SELECT match_guid, time_seconds, overtime, clock_trace FROM source_reports ORDER BY match_guid',
    ).all();
    expect(reports.results).toEqual([
      { match_guid: 'synthetic-forfeit', time_seconds: 143, overtime: 0, clock_trace: JSON.stringify(clockTrace) },
      { match_guid: 'synthetic-older', time_seconds: null, overtime: null, clock_trace: null },
      { match_guid: 'synthetic-overtime', time_seconds: 41, overtime: 1, clock_trace: null },
    ]);
    const endings = await env.DB.prepare(
      `SELECT match_guid, forfeit, overtime, COUNT(*) AS players FROM match_results
      WHERE match_guid IN ('synthetic-forfeit', 'synthetic-overtime', 'synthetic-older')
      GROUP BY match_guid, forfeit, overtime ORDER BY match_guid`,
    ).all();
    expect(endings.results).toEqual([
      { match_guid: 'synthetic-forfeit', forfeit: 1, overtime: 0, players: 4 },
      { match_guid: 'synthetic-older', forfeit: null, overtime: null, players: 4 },
      { match_guid: 'synthetic-overtime', forfeit: 0, overtime: 1, players: 4 },
    ]);
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

describe('telling the rank source a ranked match ended', () => {
  const rankKey = 'k'.repeat(40);

  async function lastRankedMatch(): Promise<string | null> {
    (env as { RANK_SOURCE_KEY?: string }).RANK_SOURCE_KEY = rankKey;
    const response = await exports.default.fetch(`${origin}/api/ranks/activity`, {
      headers: { 'X-Rank-Source-Key': rankKey },
    });
    expect(response.status).toBe(200);
    return (await response.json<{ lastRankedMatchAt: string | null }>()).lastRankedMatchAt;
  }

  const send = async (token: string, body: unknown) =>
    expect((await call('/api/live', { method: 'POST', token, body })).status).toBe(200);

  test('only a ranked 2v2 match moves the time the source reads, and another playlist keeps it', async () => {
    expect(await lastRankedMatch()).toBeNull();
    const token = await pairedToken();
    await send(token, livePayload({ guid: 'synthetic-casual-match', playlist: 2 }));
    expect(await lastRankedMatch()).toBeNull();

    await send(token, livePayload());
    const ranked = await lastRankedMatch();
    expect(Date.parse(ranked ?? '')).toBeGreaterThan(Date.now() - 60_000);
    await send(token, livePayload({ guid: 'synthetic-casual-match-2', playlist: 2 }));
    expect(await lastRankedMatch()).toBe(ranked);

    const targets = await exports.default.fetch(`${origin}/api/ranks/targets`, {
      headers: { 'X-Rank-Source-Key': rankKey },
    });
    expect(await targets.json()).toMatchObject({ lastRankedMatchAt: ranked });
  });

  test('the time is only for the rank source', async () => {
    (env as { RANK_SOURCE_KEY?: string }).RANK_SOURCE_KEY = rankKey;
    expect((await exports.default.fetch(`${origin}/api/ranks/activity`)).status).toBe(401);
  });
});
