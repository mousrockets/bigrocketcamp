import { env, exports } from 'cloudflare:workers';
import { beforeEach, expect, test } from 'vitest';
import { clubStats } from '../lib/domain';

// A tournament won, declared by a member on its last match: −50 for each club player who won it.

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

/** One line of a match: team 0 wins it. */
const line = (match: string, player: string, team: number, playlist: number) =>
  env.DB.prepare(
    `INSERT INTO match_results (match_guid, player_id, name, day, kind, team, winner, score, goals, assists, saves,
      received, review_required, verification, source_types, selected_source, playlist)
     VALUES (?, ?, ?, '2026-11-20', 'match', ?, 0, 250, 0, 0, 0, '2026-11-20T20:00:00.000Z', 0, 'single', 'collector',
      'collector', ?)`,
  ).bind(match, `Epic|${player}|0`, player, team, playlist);

let bob: string;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions'),
    env.DB.prepare('DELETE FROM match_results'),
    env.DB.prepare('DELETE FROM tournament_wins'),
    env.DB.prepare('DELETE FROM exercises'),
    env.DB.prepare('DELETE FROM members'),
    env.DB.prepare(
      "INSERT INTO members (id, email, role, duo_pseudo, platform, roster_position) VALUES ('member-alice', 'alice@example.com', 'admin', 'alice', 'pc', 1), ('member-bob', 'bob@example.com', 'member', 'bob', 'xbox', 2), ('member-carl', 'carl@example.com', 'member', 'carl', 'pc', 3)",
    ),
    // The final of a tournament: alice and bob win it against carl and a stranger.
    line('final', 'alice', 0, 34),
    line('final', 'bob', 0, 34),
    line('final', 'carl', 1, 34),
    line('final', 'stranger', 1, 34),
    line('ranked', 'alice', 0, 11),
    line('lost-semi', 'carl', 1, 22),
  ]);
  bob = await sessionOf('member-bob');
});

const board = async () => (await call('/api/state?since=0', bob)).json<Parameters<typeof clubStats>[0]>();

test('a member declares the final won: each club player who won it dodges 50 pushups', async () => {
  const before = await board();
  const declared = await call('/api/tournament-wins', bob, 'POST', { matchGuid: 'final' });
  expect(declared.status).toBe(200);
  // Declared twice, it still counts once.
  expect((await call('/api/tournament-wins', bob, 'POST', { matchGuid: 'final' })).status).toBe(200);

  const after = await board();
  expect(after.rules?.tournamentWins).toEqual(['final']);
  const dueOf = (sources: typeof after) =>
    Object.fromEntries(clubStats(sources, ['alice', 'bob', 'carl']).map((player) => [player.name, player.due]));
  expect(dueOf(before)).toEqual({ alice: 0, bob: 0, carl: 10 });
  expect(dueOf(after)).toEqual({ alice: -50, bob: -50, carl: 10 });
});

test('a declaration made by mistake is taken back', async () => {
  await call('/api/tournament-wins', bob, 'POST', { matchGuid: 'final' });
  const { version } = await (await call('/api/state?since=0', bob)).json<{ version: number }>();
  expect((await call('/api/tournament-wins', bob, 'DELETE', { matchGuid: 'final' })).status).toBe(200);
  const after = await (await call(`/api/state?since=${version}`, bob)).json<{
    version: number;
    rules: { tournamentWins: string[] };
  }>();
  expect(after.version).toBeGreaterThan(version);
  expect(after.rules.tournamentWins).toEqual([]);
});

test('only a tournament match the club won can end a tournament won', async () => {
  for (const matchGuid of ['ranked', 'lost-semi', 'unknown']) {
    const refused = await call('/api/tournament-wins', bob, 'POST', { matchGuid });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({
      error: 'Seul un match de tournoi gagné par le club peut finir un tournoi gagné.',
    });
  }
  expect((await call('/api/tournament-wins', bob, 'POST', { matchGuid: '' })).status).toBe(400);
  expect((await call('/api/tournament-wins', null, 'POST', { matchGuid: 'final' })).status).toBe(401);
  expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM tournament_wins').first('n')).toBe(0);
});
