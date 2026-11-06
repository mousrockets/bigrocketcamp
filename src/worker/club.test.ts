import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, test } from 'vitest';

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

const count = async (sql: string, ...values: unknown[]) =>
  Number(
    await env.DB.prepare(sql)
      .bind(...values)
      .first('n'),
  );

let admin: string;
let member: string;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions'),
    env.DB.prepare('DELETE FROM sign_in_codes'),
    env.DB.prepare('DELETE FROM members'),
    env.DB.prepare('DELETE FROM exercises'),
    env.DB.prepare('DELETE FROM player_identities'),
    env.DB.prepare('DELETE FROM solo_ranks'),
    env.DB.prepare("UPDATE club_settings SET name = 'Le Club Fictif'"),
    env.DB.prepare(
      "INSERT INTO members (id, email, role, duo_pseudo, platform, roster_position) VALUES ('member-alice', 'alice@example.com', 'admin', 'alice', 'pc', 1), ('member-bob', 'bob@example.com', 'member', 'bob', 'xbox', 2)",
    ),
  ]);
  admin = await sessionOf('member-alice');
  member = await sessionOf('member-bob');
});

describe('the club', () => {
  test('before signing in, only its name is public', async () => {
    const response = await call('/api/club/name', null);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ name: 'Le Club Fictif' });
    expect((await call('/api/club', null)).status).toBe(401);
  });

  test('a member sees its players in the order they joined, and their own profile', async () => {
    const response = await call('/api/club', member);
    const club = await response.json<{ name: string; players: unknown[]; me: { role: string; duoPseudo: string } }>();
    expect(club.name).toBe('Le Club Fictif');
    expect(club.players).toEqual([
      { slot: 'alice', platform: 'pc' },
      { slot: 'bob', platform: 'xbox' },
    ]);
    expect(club.me).toMatchObject({ role: 'member', duoPseudo: 'bob', duoPseudoLocked: false });
  });

  test('only an administrator renames it', async () => {
    expect((await call('/api/club', member, 'PUT', { name: 'Autre nom' })).status).toBe(403);
    expect((await call('/api/club', admin, 'PUT', { name: ' ' })).status).toBe(400);
    expect((await call('/api/club', admin, 'PUT', { name: '  Les   Nouveaux ' })).status).toBe(200);
    expect(await (await call('/api/club/name', null)).json()).toEqual({ name: 'Les Nouveaux' });
  });
});

describe('the profile', () => {
  test('a new member chooses a duo pseudo and joins the roster after the others', async () => {
    await env.DB.prepare("INSERT INTO members (id, email) VALUES ('member-carla', 'carla@example.com')").run();
    const carla = await sessionOf('member-carla');
    const before = await (await call('/api/club', carla)).json<{ me: { duoPseudo: string | null } }>();
    expect(before.me.duoPseudo).toBeNull();

    const saved = await call('/api/profile', carla, 'PUT', {
      duoPseudo: ' Carla ',
      soloPseudo: 'Carla Solo',
      platform: 'switch',
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ duoPseudo: 'carla', soloPseudo: 'Carla Solo', platform: 'switch' });
    const after = await (await call('/api/club', carla)).json<{ players: { slot: string }[] }>();
    expect(after.players.map((player) => player.slot)).toEqual(['alice', 'bob', 'carla']);
  });

  test('a duo pseudo is unique, valid, and comes with a platform', async () => {
    expect((await call('/api/profile', member, 'PUT', { duoPseudo: 'ALICE', platform: 'pc' })).status).toBe(409);
    expect((await call('/api/profile', member, 'PUT', { duoPseudo: 'b|ob', platform: 'pc' })).status).toBe(400);
    expect((await call('/api/profile', member, 'PUT', { duoPseudo: 'observer', platform: 'pc' })).status).toBe(400);
    expect((await call('/api/profile', member, 'PUT', { duoPseudo: 'bob', platform: 'ps5' })).status).toBe(400);
  });

  test('a duo pseudo changes until the player has game history, then stays', async () => {
    expect((await call('/api/profile', member, 'PUT', { duoPseudo: 'bobby', platform: 'pc' })).status).toBe(200);
    await env.DB.prepare(
      "INSERT INTO exercises (id, player, count, day, created, author, type) VALUES ('exercise-of-bobby-0001', 'bobby', 10, '2026-11-01', '2026-11-01T10:00:00.000Z', 'member-bob', 'pushups')",
    ).run();
    const locked = await (await call('/api/profile', member)).json<{ duoPseudoLocked: boolean }>();
    expect(locked.duoPseudoLocked).toBe(true);
    expect((await call('/api/profile', member, 'PUT', { duoPseudo: 'bob', platform: 'pc' })).status).toBe(409);
    const otherFields = await call('/api/profile', member, 'PUT', {
      duoPseudo: 'bobby',
      soloPseudo: 'Solo',
      platform: 'playstation',
    });
    expect(otherFields.status).toBe(200);
  });

  test('another solo pseudo or platform forgets the solo account found, so the rank source looks it up again', async () => {
    const epicId = `Epic|${'b'.repeat(32)}|0`;
    const save = (soloPseudo: string, platform = 'pc') =>
      call('/api/profile', member, 'PUT', { duoPseudo: 'bob', soloPseudo, platform });
    const found = async () => {
      await env.DB.batch([
        env.DB.prepare("UPDATE members SET solo_player_id = ? WHERE id = 'member-bob'").bind(epicId),
        env.DB.prepare(
          "INSERT INTO solo_ranks (player, player_id, mmr, status) VALUES ('bob', ?, 1320, 'ready') ON CONFLICT(player) DO NOTHING",
        ).bind(epicId),
      ]);
    };
    const kept = async () => ({
      id: await env.DB.prepare("SELECT solo_player_id FROM members WHERE id = 'member-bob'").first('solo_player_id'),
      ranks: await count("SELECT COUNT(*) AS n FROM solo_ranks WHERE player = 'bob'"),
    });
    expect((await save('Bob Solo')).status).toBe(200);
    await found();
    expect((await save('BOB SOLO')).status).toBe(200);
    expect(await kept()).toEqual({ id: epicId, ranks: 1 });
    expect((await save('Bob Other')).status).toBe(200);
    expect(await kept()).toEqual({ id: null, ranks: 0 });
    await found();
    expect((await save('Bob Other', 'playstation')).status).toBe(200);
    expect(await kept()).toEqual({ id: null, ranks: 0 });
  });

  test('choosing a pseudo with history never hands over its game identity', async () => {
    await env.DB.prepare(
      "INSERT INTO player_identities (slot, owner, player_id) VALUES ('carla', 'member-gone', 'Epic|carla-test|0')",
    ).run();
    await env.DB.prepare("INSERT INTO members (id, email) VALUES ('member-carla', 'carla@example.com')").run();
    const carla = await sessionOf('member-carla');
    expect((await call('/api/profile', carla, 'PUT', { duoPseudo: 'carla', platform: 'pc' })).status).toBe(200);
    expect(await count("SELECT COUNT(*) AS n FROM player_identities WHERE owner = 'member-carla'")).toBe(0);
  });

  test('a member deletes their own account: sessions and address go, game records stay', async () => {
    await env.DB.prepare(
      "INSERT INTO exercises (id, player, count, day, created, author, type) VALUES ('exercise-of-bob-00001', 'bob', 10, '2026-11-01', '2026-11-01T10:00:00.000Z', 'member-bob', 'pushups')",
    ).run();
    const response = await call('/api/profile', member, 'DELETE');
    expect(response.status).toBe(204);
    expect(response.headers.getSetCookie().at(-1)).toMatch(/^session=;/);
    expect(await count("SELECT COUNT(*) AS n FROM members WHERE id = 'member-bob'")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM sessions WHERE member_id = 'member-bob'")).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM exercises WHERE player = 'bob'")).toBe(1);
    expect((await call('/api/club', member)).status).toBe(401);
  });

  test('the only administrator names another one before leaving', async () => {
    expect((await call('/api/profile', admin, 'DELETE')).status).toBe(409);
  });
});

describe('the members, for administrators', () => {
  test('a member cannot manage them', async () => {
    expect((await call('/api/members', member)).status).toBe(403);
    expect((await call('/api/members', member, 'POST', { email: 'dan@example.com' })).status).toBe(403);
  });

  test('an invited address can then ask for a sign-in code; an unknown one still cannot', async () => {
    const invited = await call('/api/members', admin, 'POST', { email: ' Dan@Example.com ' });
    expect(invited.status).toBe(201);
    expect(await invited.json()).toMatchObject({ email: 'dan@example.com', role: 'member', duoPseudo: null });
    expect((await call('/api/members', admin, 'POST', { email: 'dan@example.com' })).status).toBe(409);
    expect((await call('/api/members', admin, 'POST', { email: 'not-an-address' })).status).toBe(400);

    await call('/api/auth/code', null, 'POST', { email: 'dan@example.com' });
    await call('/api/auth/code', null, 'POST', { email: 'stranger@example.com' });
    expect(await count('SELECT COUNT(*) AS n FROM sign_in_codes')).toBe(1);

    const list = await (await call('/api/members', admin)).json<{ members: { email: string }[] }>();
    expect(list.members.map((entry) => entry.email)).toEqual([
      'alice@example.com',
      'bob@example.com',
      'dan@example.com',
    ]);
  });

  test('removing a member closes their sessions and their sign-in', async () => {
    expect((await call('/api/members', admin, 'DELETE', { id: 'member-bob' })).status).toBe(204);
    expect((await call('/api/club', member)).status).toBe(401);
    await call('/api/auth/code', null, 'POST', { email: 'bob@example.com' });
    expect(await count('SELECT COUNT(*) AS n FROM sign_in_codes')).toBe(0);
    expect((await call('/api/members', admin, 'DELETE', { id: 'member-alice' })).status).toBe(400);
    expect((await call('/api/members', admin, 'DELETE', { id: 'member-unknown' })).status).toBe(404);
  });

  test('roles change, but the club keeps an administrator', async () => {
    expect((await call('/api/members', admin, 'PATCH', { id: 'member-alice', role: 'member' })).status).toBe(409);
    expect((await call('/api/members', admin, 'PATCH', { id: 'member-bob', role: 'admin' })).status).toBe(204);
    expect((await call('/api/members', member)).status).toBe(200);
    expect((await call('/api/members', admin, 'PATCH', { id: 'member-alice', role: 'member' })).status).toBe(204);
    expect((await call('/api/members', admin)).status).toBe(403);
  });

  test('a request from another site is refused', async () => {
    const response = await exports.default.fetch(`${origin}/api/members`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', Cookie: admin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dan@example.com' }),
    });
    expect(response.status).toBe(403);
  });
});

describe('the migration of the instance the app was born in', () => {
  test('gives its members their slot, platform and role, and names the club', async () => {
    const migration = env.TEST_MIGRATIONS.find((candidate) => candidate.name.startsWith('0012_'));
    const dataStatements = migration?.queries.filter((query) => /^\s*(UPDATE|INSERT)/m.test(query)) ?? [];
    expect(dataStatements).toHaveLength(3);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM members'),
      env.DB.prepare('DELETE FROM club_settings'),
      env.DB.prepare(
        "INSERT INTO members (id, email) VALUES ('owner-1', 'one@example.com'), ('owner-2', 'two@example.com'), ('owner-3', 'three@example.com'), ('owner-4', 'four@example.com')",
      ),
      env.DB.prepare(
        "INSERT INTO player_identities (slot, owner, player_id) VALUES ('kevin-74000', 'owner-1', 'PS4|a|0'), ('nokouki', 'owner-2', 'Epic|b|0'), ('chat-pris-tea', 'owner-3', 'Epic|c|0')",
      ),
    ]);
    for (const statement of dataStatements) await env.DB.prepare(statement).run();

    const members = await env.DB.prepare(
      'SELECT id, role, duo_pseudo, platform, roster_position FROM members ORDER BY id',
    ).all();
    expect(members.results).toEqual([
      { id: 'owner-1', role: 'member', duo_pseudo: 'kevin-74000', platform: 'playstation', roster_position: 3 },
      { id: 'owner-2', role: 'admin', duo_pseudo: 'nokouki', platform: 'pc', roster_position: 2 },
      { id: 'owner-3', role: 'member', duo_pseudo: 'chat-pris-tea', platform: 'pc', roster_position: 1 },
      { id: 'owner-4', role: 'member', duo_pseudo: null, platform: null, roster_position: null },
    ]);
    expect(await env.DB.prepare('SELECT name FROM club_settings').first('name')).toBe('Les Trois Mousrockets');
  });
});
