import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, test } from 'vitest';

// A member starts their play session in Matchs: the club sees it, and the rank source reads every account of theirs,
// and only theirs, every two minutes.

const origin = 'http://localhost';
const rankKey = 'rank-source-key-for-the-play-session-tests';

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Opens a session of the app for a member and returns its cookie. */
async function signedIn(memberId: string): Promise<string> {
  const token = `token-${memberId}-${crypto.randomUUID()}`;
  await env.DB.prepare('INSERT INTO sessions (token_hash, member_id, expires) VALUES (?, ?, ?)')
    .bind(await sha256(token), memberId, Date.now() + 86_400_000)
    .run();
  return `session=${token}`;
}

function call(path: string, headers: Record<string, string>, body?: unknown) {
  return exports.default.fetch(`${origin}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const act = (cookie: string, action: string) => call('/api/play-session', { Cookie: cookie }, { action });
const sessionsSeenBy = async (cookie: string) =>
  (await (await call('/api/state', { Cookie: cookie })).json<{ playSessions: { player: string }[] }>()).playSessions;
const activity = async () =>
  (await call('/api/ranks/activity', { 'X-Rank-Source-Key': rankKey })).json<{
    sessionUntil: string | null;
    sessionPlayers: string[];
  }>();

let kevin: string;
let alice: string;

beforeEach(async () => {
  (env as { RANK_SOURCE_KEY?: string }).RANK_SOURCE_KEY = rankKey;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM play_sessions'),
    env.DB.prepare('DELETE FROM sessions'),
    env.DB.prepare('DELETE FROM solo_ranks'),
    env.DB.prepare('DELETE FROM player_ranks'),
    env.DB.prepare('DELETE FROM members'),
    env.DB.prepare(
      "INSERT INTO members (id, email, role, duo_pseudo, platform, roster_position, solo_player_id) VALUES ('member-kevin', 'kevin@example.com', 'member', 'kevin', 'playstation', 1, 'Epic|kevin-solo|0'), ('member-alice', 'alice@example.com', 'admin', 'alice', 'pc', 2, NULL)",
    ),
    env.DB.prepare(
      "INSERT INTO solo_ranks (player, player_id, mmr, status) VALUES ('kevin', 'epic|kevin-solo|0', 1180, 'ready')",
    ),
    env.DB.prepare(
      "INSERT INTO player_ranks (player, player_id, mmr, last_attempt, status) VALUES ('kevin', 'Epic|kevin|0', 1320, '2026-11-27T20:00:00Z', 'ready')",
    ),
  ]);
  kevin = await signedIn('member-kevin');
  alice = await signedIn('member-alice');
});

describe('a play session', () => {
  test('starts with the member’s duo and solo ratings, and the whole club sees it', async () => {
    const started = await act(kevin, 'start');
    expect(started.status).toBe(200);
    const { session } = await started.json<{ session: { player: string; endsAt: string } }>();
    expect(session).toMatchObject({ player: 'kevin', startDuoMmr: 1320, startSoloMmr: 1180 });
    expect(await sessionsSeenBy(alice)).toEqual([expect.objectContaining({ player: 'kevin' })]);
    // The rank source reads Kevin's accounts every two minutes until it ends, and no one else's.
    expect(await activity()).toMatchObject({ sessionUntil: session.endsAt, sessionPlayers: ['kevin'] });
  });

  test('starts without a solo account: the duo one is read', async () => {
    const started = await act(alice, 'start');
    expect(started.status).toBe(200);
    expect(await started.json()).toMatchObject({ session: { player: 'alice', startDuoMmr: null, startSoloMmr: null } });
    expect((await activity()).sessionPlayers).toEqual(['alice']);
  });

  test('started again, keeps the one under way', async () => {
    const first = await (await act(kevin, 'start')).json<{ session: { startedAt: string } }>();
    const again = await (await act(kevin, 'start')).json<{ session: { startedAt: string } }>();
    expect(again.session.startedAt).toBe(first.session.startedAt);
  });

  test('stops when the member stops it', async () => {
    await act(kevin, 'start');
    expect(await (await act(kevin, 'stop')).json()).toEqual({ session: null });
    expect(await sessionsSeenBy(alice)).toEqual([]);
    expect(await activity()).toMatchObject({ sessionUntil: null, sessionPlayers: [] });
  });

  test('a member stops only their own', async () => {
    await act(kevin, 'start');
    await act(alice, 'stop');
    expect(await sessionsSeenBy(kevin)).toHaveLength(1);
  });

  test('refuses an action it does not know', async () => {
    expect((await act(kevin, 'pause')).status).toBe(400);
  });
});
