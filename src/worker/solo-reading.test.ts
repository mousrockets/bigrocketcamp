import { env, exports } from 'cloudflare:workers';
import { beforeEach, expect, test } from 'vitest';
import { saveOwnProfile } from '../lib/members';

// Naming a solo account asks the rank source to read soon: it reads a minute after the time /api/ranks/activity
// gives, as after a ranked match.

const key = 'k'.repeat(40);

beforeEach(async () => {
  (env as { RANK_SOURCE_KEY?: string }).RANK_SOURCE_KEY = key;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM collectors'),
    env.DB.prepare(
      "INSERT OR REPLACE INTO members (id, email, role) VALUES ('member-alice', 'alice@example.com', 'member')",
    ),
  ]);
});

const activity = async () => {
  const response = await exports.default.fetch('https://app.test/api/ranks/activity', {
    headers: { 'X-Rank-Source-Key': key },
  });
  return ((await response.json()) as { lastRankedMatchAt: string | null }).lastRankedMatchAt;
};

test('a new solo account asks the rank source to read a minute later', async () => {
  const before = Date.now();
  await saveOwnProfile(env.DB, 'member-alice', { duoPseudo: 'alice', soloPseudo: 'alice-solo', platform: 'pc' });
  const asked = await activity();
  expect(asked).not.toBeNull();
  expect(Date.parse(asked ?? '')).toBeGreaterThanOrEqual(before - 1000);
});

test('saving the same profile again asks nothing more', async () => {
  await saveOwnProfile(env.DB, 'member-alice', { duoPseudo: 'alice', soloPseudo: 'alice-solo', platform: 'pc' });
  const first = await activity();
  await new Promise((resolve) => setTimeout(resolve, 5));
  await saveOwnProfile(env.DB, 'member-alice', { duoPseudo: 'alice', soloPseudo: 'alice-solo', platform: 'pc' });
  expect(await activity()).toBe(first);
});
