import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, test } from 'vitest';
import { joinTestClub } from '../lib/club-fixture';
import { readRankSourceHealth } from '../lib/rank-source';

const key = 'k'.repeat(40);
const origin = 'http://localhost';

function call(path: string, init: RequestInit = {}, withKey = true) {
  const headers = new Headers(init.headers);
  if (withKey) headers.set('X-Rank-Source-Key', key);
  return exports.default.fetch(`${origin}${path}`, { ...init, headers });
}

function post(ranks: unknown) {
  return call('/api/ranks', { method: 'POST', body: JSON.stringify({ ranks }) });
}

const rank = (mmr: number, observedAt = new Date().toISOString()) => ({
  player: 'bob',
  playerId: 'Epic|bob-test|0',
  mmr,
  tier: 16,
  division: 3,
  observedAt,
});

beforeEach(async () => {
  (env as { RANK_SOURCE_KEY?: string }).RANK_SOURCE_KEY = key;
  await joinTestClub(env.DB);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM mmr_entries'),
    env.DB.prepare('DELETE FROM player_ranks'),
    env.DB.prepare('DELETE FROM player_identities'),
    env.DB.prepare(
      "INSERT INTO player_identities (slot, owner, player_id) VALUES ('bob', 'member-bob', 'Epic|bob-test|0')",
    ),
  ]);
});

describe('the rank source API', () => {
  test('refuses a caller without the key', async () => {
    expect((await call('/api/ranks/targets', {}, false)).status).toBe(401);
  });

  test('lists the game identities whose rank to read', async () => {
    const response = await call('/api/ranks/targets');
    expect(await response.json()).toEqual({ targets: [{ player: 'bob', playerId: 'Epic|bob-test|0' }] });
  });

  test('stores a rank as ready, and a new entry only when the rating changes', async () => {
    expect(await (await post([rank(1180)])).json()).toEqual({ ok: true, changed: 1 });
    expect(await (await post([rank(1180)])).json()).toEqual({ ok: true, changed: 0 });
    expect(await (await post([rank(1195)])).json()).toEqual({ ok: true, changed: 1 });
    const stored = await env.DB.prepare(
      "SELECT mmr, tier, division, status FROM player_ranks WHERE player = 'bob'",
    ).first();
    expect(stored).toEqual({ mmr: 1195, tier: 16, division: 3, status: 'ready' });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM mmr_entries').first('n')).toBe(2);
  });

  test('stores the ranked matches played when the source sends them', async () => {
    await post([{ ...rank(1180), matches: 395 }]);
    expect(
      await env.DB.prepare("SELECT matches_played FROM player_ranks WHERE player = 'bob'").first('matches_played'),
    ).toBe(395);
    await post([rank(1180)]);
    expect(
      await env.DB.prepare("SELECT matches_played FROM player_ranks WHERE player = 'bob'").first('matches_played'),
    ).toBe(395);
    expect((await post([{ ...rank(1180), matches: -1 }])).status).toBe(400);
  });

  test('refuses a rank for an unknown identity or out of range', async () => {
    expect((await post([{ ...rank(1180), playerId: 'Epic|someone-else|0' }])).status).toBe(400);
    expect((await post([rank(20_000)])).status).toBe(400);
    expect((await post([rank(1180, '2020-01-01T00:00:00.000Z')])).status).toBe(400);
  });
});

describe('the rank source health', () => {
  const hour = 60 * 60 * 1000;

  test('is stale before any reading', async () => {
    expect(await readRankSourceHealth(env.DB)).toEqual({ lastReadAt: null, stale: true });
  });

  test('stays healthy for two hours after a reading, then turns stale', async () => {
    const observedAt = new Date().toISOString();
    await post([rank(1180, observedAt)]);
    const read = Date.parse(observedAt);
    expect(await readRankSourceHealth(env.DB, read + hour)).toEqual({ lastReadAt: observedAt, stale: false });
    expect((await readRankSourceHealth(env.DB, read + 3 * hour)).stale).toBe(true);
  });

  test('ignores ranks the players entered themselves', async () => {
    await env.DB.prepare(
      "INSERT INTO player_ranks (player, player_id, playlist, mmr, fetched_at, last_attempt, status) VALUES ('bob', 'Epic|bob-test|0', 11, 1180, ?1, ?1, 'manual')",
    )
      .bind(new Date().toISOString())
      .run();
    expect((await readRankSourceHealth(env.DB)).stale).toBe(true);
  });
});
