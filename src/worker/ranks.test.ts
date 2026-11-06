import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, test } from 'vitest';

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
  player: 'nokouki',
  playerId: 'Epic|nokouki-test|0',
  mmr,
  tier: 16,
  division: 3,
  observedAt,
});

beforeEach(async () => {
  (env as { RANK_SOURCE_KEY?: string }).RANK_SOURCE_KEY = key;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM mmr_entries'),
    env.DB.prepare('DELETE FROM player_ranks'),
    env.DB.prepare('DELETE FROM player_identities'),
    env.DB.prepare(
      "INSERT INTO player_identities (slot, owner, player_id) VALUES ('nokouki', 'member-dimitri', 'Epic|nokouki-test|0')",
    ),
  ]);
});

describe('the rank source API', () => {
  test('refuses a caller without the key', async () => {
    expect((await call('/api/ranks/targets', {}, false)).status).toBe(401);
  });

  test('lists the game identities whose rank to read', async () => {
    const response = await call('/api/ranks/targets');
    expect(await response.json()).toEqual({ targets: [{ player: 'nokouki', playerId: 'Epic|nokouki-test|0' }] });
  });

  test('stores a rank as ready, and a new entry only when the rating changes', async () => {
    expect(await (await post([rank(1180)])).json()).toEqual({ ok: true, changed: 1 });
    expect(await (await post([rank(1180)])).json()).toEqual({ ok: true, changed: 0 });
    expect(await (await post([rank(1195)])).json()).toEqual({ ok: true, changed: 1 });
    const stored = await env.DB.prepare(
      "SELECT mmr, tier, division, status FROM player_ranks WHERE player = 'nokouki'",
    ).first();
    expect(stored).toEqual({ mmr: 1195, tier: 16, division: 3, status: 'ready' });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM mmr_entries').first('n')).toBe(2);
  });

  test('refuses a rank for an unknown identity or out of range', async () => {
    expect((await post([{ ...rank(1180), playerId: 'Epic|someone-else|0' }])).status).toBe(400);
    expect((await post([rank(20_000)])).status).toBe(400);
    expect((await post([rank(1180, '2020-01-01T00:00:00.000Z')])).status).toBe(400);
  });
});
