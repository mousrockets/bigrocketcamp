import { env, exports } from 'cloudflare:workers';
import { beforeEach, expect, test } from 'vitest';

// The Stats page's own route: each account's MMR over each season, for a signed-in member only.

const origin = 'http://localhost';

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const seasons = (cookie: string | null) =>
  exports.default.fetch(`${origin}/api/stats/seasons`, {
    headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
  });

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions'),
    env.DB.prepare('DELETE FROM mmr_entries'),
    env.DB.prepare('DELETE FROM solo_mmr_entries'),
    env.DB.prepare('DELETE FROM members'),
    env.DB.prepare('DELETE FROM statfeed_labels'),
    env.DB.prepare(
      "INSERT INTO statfeed_labels (name, label, updated) VALUES ('Save', 'Arrêt', '2026-11-26T20:00:00.000Z')",
    ),
    env.DB.prepare(
      "INSERT INTO members (id, email, role, duo_pseudo, platform, roster_position) VALUES ('member-alice', 'alice@example.com', 'admin', 'alice', 'pc', 1)",
    ),
    env.DB.prepare(
      "INSERT INTO mmr_entries (id, player, mmr, tier, division, recorded_at) VALUES ('a', 'alice', 1200, 17, 2, '2026-10-01T20:00:00.000Z'), ('b', 'alice', 1260, 18, 1, '2026-10-02T20:00:00.000Z'), ('c', 'stranger', 900, NULL, NULL, '2026-10-02T20:00:00.000Z')",
    ),
  ]);
});

test('answers a member each club player’s season and the game’s words for its events, and nobody else', async () => {
  expect((await seasons(null)).status).toBe(401);

  const token = `token-${crypto.randomUUID()}`;
  await env.DB.prepare('INSERT INTO sessions (token_hash, member_id, expires) VALUES (?, ?, ?)')
    .bind(await sha256(token), 'member-alice', Date.now() + 86_400_000)
    .run();
  const answer = await seasons(`session=${token}`);
  expect(answer.status).toBe(200);
  expect(await answer.json()).toEqual({
    seasons: [
      {
        player: 'alice',
        account: 'duo',
        season: 24,
        first: 1200,
        last: 1260,
        peak: { mmr: 1260, label: expect.stringContaining('Champion III'), tier: 18 },
      },
    ],
    statfeedLabels: { Save: 'Arrêt' },
  });
});
