import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, test } from 'vitest';
import { dayAfter } from '../lib/club-rules';
import { parisDay } from '../lib/days';
import { observationWrites } from '../lib/reconcile';

// The club settings of issue #9: the logo, the challenge rules, and a new player's first game identity.

const origin = 'http://localhost';

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

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

function sendLogo(cookie: string | null, image: Uint8Array, contentType: string, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { Origin: origin, 'Content-Type': contentType, ...extra };
  if (cookie) headers.Cookie = cookie;
  return exports.default.fetch(`${origin}/api/club/logo`, { method: 'PUT', headers, body: image });
}

/** The first bytes of a WebP file, then filler: the API only reads the signature. */
function webp(size = 2000): Uint8Array {
  const bytes = new Uint8Array(size).fill(7);
  bytes.set(
    [...'RIFF'].map((c) => c.charCodeAt(0)),
    0,
  );
  bytes.set(
    [...'WEBP'].map((c) => c.charCodeAt(0)),
    8,
  );
  return bytes;
}

let admin: string;
let member: string;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions'),
    env.DB.prepare('DELETE FROM members'),
    env.DB.prepare('DELETE FROM club_logo'),
    env.DB.prepare('DELETE FROM last_place_rules WHERE effective_from > ?').bind(parisDay()),
    env.DB.prepare('DELETE FROM forfeit_rules WHERE effective_from > ?').bind(parisDay()),
    env.DB.prepare('DELETE FROM player_identities'),
    env.DB.prepare('DELETE FROM player_identity_aliases'),
    env.DB.prepare('DELETE FROM result_observations'),
    env.DB.prepare('DELETE FROM source_reports'),
    env.DB.prepare(
      "INSERT INTO members (id, email, role, duo_pseudo, platform, roster_position) VALUES ('member-alice', 'alice@example.com', 'admin', 'alice', 'pc', 1), ('member-bob', 'bob@example.com', 'member', 'bob', 'xbox', 2)",
    ),
  ]);
  admin = await sessionOf('member-alice');
  member = await sessionOf('member-bob');
});

describe('the club logo', () => {
  test('an administrator sends one; everyone, signed in or not, then sees it at an address kept for good', async () => {
    expect((await call('/api/club/logo', null)).status).toBe(404);
    expect(await (await call('/api/club/name', null)).json()).toMatchObject({ logo: null });

    const image = webp();
    const sent = await sendLogo(admin, image, 'image/webp');
    expect(sent.status).toBe(200);
    const { logo } = await sent.json<{ logo: string }>();
    expect(logo).toMatch(/^\/api\/club\/logo\?v=[0-9a-f]{16}$/);
    expect(await (await call('/api/club/name', null)).json()).toMatchObject({ logo });
    expect(await (await call('/api/club', member)).json()).toMatchObject({ logo });

    const served = await call(logo, null);
    expect(served.status).toBe(200);
    expect(served.headers.get('Content-Type')).toBe('image/webp');
    expect(served.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(image);

    // Without its version, the address is checked again each time, and costs nothing when unchanged.
    const unversioned = await call('/api/club/logo', null);
    expect(unversioned.headers.get('Cache-Control')).toBe('no-cache');
    const etag = unversioned.headers.get('ETag') ?? '';
    const again = await exports.default.fetch(`${origin}/api/club/logo`, { headers: { 'If-None-Match': etag } });
    expect(again.status).toBe(304);

    const other = webp(3000);
    const { logo: next } = await (await sendLogo(admin, other, 'image/webp')).json<{ logo: string }>();
    expect(next).not.toBe(logo);

    expect((await call('/api/club/logo', admin, 'DELETE')).status).toBe(200);
    expect((await call('/api/club/logo', null)).status).toBe(404);
  });

  test('only an administrator of the club changes it, from the app itself', async () => {
    expect((await sendLogo(null, webp(), 'image/webp')).status).toBe(401);
    expect((await sendLogo(member, webp(), 'image/webp')).status).toBe(403);
    expect((await call('/api/club/logo', member, 'DELETE')).status).toBe(403);
    expect((await sendLogo(admin, webp(), 'image/webp', { Origin: 'https://evil.example' })).status).toBe(403);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM club_logo').first('n')).toBe(0);
  });

  test('a file that is not a small image is refused', async () => {
    expect((await sendLogo(admin, webp(), 'image/svg+xml')).status).toBe(415);
    expect((await sendLogo(admin, webp(), 'image/png')).status).toBe(415);
    expect((await sendLogo(admin, new TextEncoder().encode('<svg></svg>'), 'image/webp')).status).toBe(415);
    const tooLarge = await sendLogo(admin, webp(100 * 1024 + 1), 'image/webp');
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.json()).toEqual({ error: 'Logo trop lourd : 100 Ko au plus.' });
    const jpeg = new Uint8Array(500).fill(1);
    jpeg.set([0xff, 0xd8, 0xff], 0);
    expect((await sendLogo(admin, jpeg, 'image/jpeg')).status).toBe(200);
    expect(await env.DB.prepare('SELECT content_type FROM club_logo').first('content_type')).toBe('image/jpeg');
  });
});

describe('the challenge rules', () => {
  const tomorrow = () => dayAfter(parisDay());
  const original = { effectiveFrom: '2026-11-06', enabled: true, ties: 'none' };

  test('by default, the +5 and the −5 apply as they did when they were written in the code', async () => {
    const club = await (await call('/api/club', member)).json<{ rules: unknown }>();
    expect(club.rules).toEqual({ lastPlace: [original], forfeit: [] });
    const board = await (await call('/api/state', member)).json<{ rules: unknown }>();
    expect(board.rules).toEqual({ lastPlace: [original], forfeit: [] });
  });

  test('a change applies from tomorrow, and asking again for today’s rule cancels it', async () => {
    const off = await call('/api/club/rules', admin, 'PUT', { lastPlace: { enabled: false } });
    expect(off.status).toBe(200);
    expect(await off.json()).toEqual({
      lastPlace: [original, { effectiveFrom: tomorrow(), enabled: false, ties: 'none' }],
      forfeit: [],
    });
    // Twice the same change keeps one row.
    await call('/api/club/rules', admin, 'PUT', { lastPlace: { enabled: false } });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM last_place_rules').first('n')).toBe(2);

    const back = await call('/api/club/rules', admin, 'PUT', { lastPlace: { enabled: true } });
    expect(await back.json()).toEqual({ lastPlace: [original], forfeit: [] });
  });

  test('the −5 of a forfeit won switches off from tomorrow, and back on cancels it', async () => {
    const off = await call('/api/club/rules', admin, 'PUT', { forfeit: { enabled: false } });
    expect(off.status).toBe(200);
    expect(await off.json()).toEqual({
      lastPlace: [original],
      forfeit: [{ effectiveFrom: tomorrow(), enabled: false }],
    });
    await call('/api/club/rules', admin, 'PUT', { forfeit: { enabled: false } });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM forfeit_rules').first('n')).toBe(1);

    const back = await call('/api/club/rules', admin, 'PUT', { forfeit: { enabled: true } });
    expect(await back.json()).toEqual({ lastPlace: [original], forfeit: [] });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM forfeit_rules').first('n')).toBe(0);
  });

  test('both rules change in one request', async () => {
    const both = await call('/api/club/rules', admin, 'PUT', {
      lastPlace: { enabled: false },
      forfeit: { enabled: false },
    });
    expect(await both.json()).toEqual({
      lastPlace: [original, { effectiveFrom: tomorrow(), enabled: false, ties: 'none' }],
      forfeit: [{ effectiveFrom: tomorrow(), enabled: false }],
    });
  });

  test('the board follows a change of rule', async () => {
    const before = await (await call('/api/state?since=0', member)).json<{ version: number }>();
    await call('/api/club/rules', admin, 'PUT', { lastPlace: { enabled: false } });
    const after = await (await call(`/api/state?since=${before.version}`, member)).json<{
      version: number;
      rules: { lastPlace: unknown[] };
    }>();
    expect(after.version).toBeGreaterThan(before.version);
    expect(after.rules.lastPlace).toHaveLength(2);

    await call('/api/club/rules', admin, 'PUT', { forfeit: { enabled: false } });
    const again = await (await call(`/api/state?since=${after.version}`, member)).json<{
      version: number;
      rules: { forfeit: unknown[] };
    }>();
    expect(again.version).toBeGreaterThan(after.version);
    expect(again.rules.forfeit).toEqual([{ effectiveFrom: tomorrow(), enabled: false }]);
  });

  test('only an administrator changes them, with a valid rule', async () => {
    expect((await call('/api/club/rules', null, 'PUT', { lastPlace: { enabled: false } })).status).toBe(401);
    expect((await call('/api/club/rules', member, 'PUT', { lastPlace: { enabled: false } })).status).toBe(403);
    const invalid = await call('/api/club/rules', admin, 'PUT', { lastPlace: { enabled: 'non' } });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'Règle des défis invalide.' });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM last_place_rules').first('n')).toBe(1);
    expect((await call('/api/club/rules', null, 'PUT', { forfeit: { enabled: false } })).status).toBe(401);
    expect((await call('/api/club/rules', member, 'PUT', { forfeit: { enabled: false } })).status).toBe(403);
    const empty = await call('/api/club/rules', admin, 'PUT', {});
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: 'Règle des défis invalide.' });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM forfeit_rules').first('n')).toBe(0);
  });

  test('the database itself refuses to rewrite a rule already in force', async () => {
    const attempts = [
      "UPDATE last_place_rules SET enabled = 0 WHERE effective_from = '2026-11-06'",
      "DELETE FROM last_place_rules WHERE effective_from = '2026-11-06'",
      "INSERT INTO last_place_rules (effective_from, enabled) VALUES ('2026-11-01', 1)",
      "INSERT INTO forfeit_rules (effective_from, enabled) VALUES ('2026-11-01', 0)",
    ];
    for (const attempt of attempts) {
      await expect(env.DB.prepare(attempt).run()).rejects.toThrow(/the past never changes/);
    }
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM last_place_rules').first('n')).toBe(1);
  });
});

describe('a new player’s game identity', () => {
  async function receiveMatch() {
    const game = { matchGuid: 'synthetic-new-player-game', day: '2026-11-05', kind: 'match', winner: 1 };
    const rows = [
      { ...game, playerId: 'Epic|carla-test|0', name: 'carla', team: 0, score: 100 },
      { ...game, playerId: 'Epic|opponent-test|0', name: 'Opponent', team: 1, score: 200 },
    ].map((row) => ({ ...row, goals: 0, assists: 0, saves: 0 }));
    const writes = await observationWrites(
      env.DB,
      {
        rows,
        rosters: [{ matchGuid: game.matchGuid, playerCount: 2 }],
        sourceId: 'synthetic-local',
        sourceType: 'collector',
      },
      'synthetic',
    );
    await env.DB.batch(writes as D1PreparedStatement[]);
  }

  test('their first confirmation, from a scoreboard received, creates it; nobody else can make it', async () => {
    await env.DB.prepare(
      "INSERT INTO members (id, email, duo_pseudo, platform, roster_position) VALUES ('member-carla', 'carla@example.com', 'carla', 'pc', 3)",
    ).run();
    const carla = await sessionOf('member-carla');
    await receiveMatch();

    const page = await (await call('/api/identities', carla)).json<{
      identities: { slot: string; known: boolean; owned: boolean }[];
    }>();
    expect(page.identities.find((identity) => identity.slot === 'carla')).toMatchObject({ known: false, owned: true });

    const confirm = { slot: 'carla', playerId: 'Epic|carla-test|0' };
    expect((await call('/api/identities', member, 'POST', confirm)).status).toBe(403);
    expect((await call('/api/identities', carla, 'POST', { ...confirm, playerId: 'Epic|never-seen|0' })).status).toBe(
      400,
    );
    expect((await call('/api/identities', carla, 'POST', confirm)).status).toBe(200);
    expect(await env.DB.prepare("SELECT owner, player_id FROM player_identities WHERE slot = 'carla'").first()).toEqual(
      { owner: 'member-carla', player_id: 'Epic|carla-test|0' },
    );
    const after = await (await call('/api/identities', carla)).json<{
      identities: { slot: string; known: boolean; owned: boolean; aliases: unknown[] }[];
    }>();
    expect(after.identities.find((identity) => identity.slot === 'carla')).toEqual({
      slot: 'carla',
      known: true,
      owned: true,
      aliases: [{ playerId: 'Epic|carla-test|0', primary: true }],
    });
  });

  test('a game ID another player already confirmed stays theirs', async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO members (id, email, duo_pseudo, platform, roster_position) VALUES ('member-carla', 'carla@example.com', 'carla', 'pc', 3)",
      ),
      env.DB.prepare(
        "INSERT INTO player_identities (slot, owner, player_id) VALUES ('bob', 'member-bob', 'Epic|bob-test|0')",
      ),
      env.DB.prepare(
        "INSERT INTO player_identity_aliases VALUES ('Epic|carla-test|0', 'bob', 'member-bob', '2026-11-05T10:00:00.000Z')",
      ),
    ]);
    const carla = await sessionOf('member-carla');
    await receiveMatch();
    const taken = await call('/api/identities', carla, 'POST', { slot: 'carla', playerId: 'Epic|carla-test|0' });
    expect(taken.status).toBe(409);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM player_identities WHERE slot = 'carla'").first('n')).toBe(0);
  });
});
