import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, test } from 'vitest';
import { joinTestClub } from '../lib/club-fixture';
import { readDoublesRanks } from '../lib/doubles-ranks';
import { saveOwnProfile } from '../lib/members';
import { readRankSourceHealth } from '../lib/rank-source';
import { currentSeason } from '../lib/season';

const key = 'k'.repeat(40);
const origin = 'http://localhost';

function call(path: string, init: RequestInit = {}, withKey = true) {
  const headers = new Headers(init.headers);
  if (withKey) headers.set('X-Rank-Source-Key', key);
  return exports.default.fetch(`${origin}${path}`, { ...init, headers });
}

function post(ranks: unknown, unresolved?: unknown) {
  return call('/api/ranks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ranks, unresolved }),
  });
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
    env.DB.prepare('UPDATE members SET solo_pseudo = NULL, solo_player_id = NULL, solo_changed_at = NULL'),
    env.DB.prepare('DELETE FROM mmr_entries'),
    env.DB.prepare('DELETE FROM player_ranks'),
    env.DB.prepare('DELETE FROM solo_mmr_entries'),
    env.DB.prepare('DELETE FROM solo_ranks'),
    env.DB.prepare('DELETE FROM player_identities'),
    env.DB.prepare('DELETE FROM player_identity_aliases'),
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
    expect(await response.json()).toEqual({
      targets: [{ player: 'bob', kind: 'duo', playerId: 'Epic|bob-test|0' }],
      lastRankedMatchAt: null,
    });
  });

  test('stores a rank as ready, and a new entry only when the rating changes', async () => {
    expect(await (await post([rank(1180)])).json()).toEqual({ ok: true, changed: 1, ignored: 0 });
    expect(await (await post([rank(1180)])).json()).toEqual({ ok: true, changed: 0, ignored: 0 });
    expect(await (await post([{ ...rank(1195), kind: 'duo' }])).json()).toEqual({ ok: true, changed: 1, ignored: 0 });
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

describe('the duo season peak', () => {
  const peak = () =>
    env.DB.prepare(
      "SELECT season, peak_mmr AS mmr, peak_tier AS tier, peak_division AS division, peak_at AS at FROM player_ranks WHERE player = 'bob'",
    ).first();

  test('is the highest rating read this season, with the rank it came with', async () => {
    const highest = new Date(Date.now() - 1000).toISOString();
    await post([{ ...rank(1180), tier: 16, division: 2, observedAt: new Date(Date.now() - 2000).toISOString() }]);
    await post([{ ...rank(1250), tier: 17, division: 1, observedAt: highest }]);
    await post([{ ...rank(1230), tier: 16, division: 4 }]);
    expect(await peak()).toEqual({ season: currentSeason.number, mmr: 1250, tier: 17, division: 1, at: highest });
    expect(await env.DB.prepare("SELECT mmr FROM player_ranks WHERE player = 'bob'").first('mmr')).toBe(1230);
  });

  test('starts over with the first reading of a new season', async () => {
    await post([rank(1400)]);
    await env.DB.prepare("UPDATE player_ranks SET season = ? WHERE player = 'bob'")
      .bind(currentSeason.number - 1)
      .run();
    await post([{ ...rank(1100), tier: 14, division: 1 }]);
    expect(await peak()).toMatchObject({ season: currentSeason.number, mmr: 1100, tier: 14, division: 1 });
  });
});

describe('the solo accounts', () => {
  const epicId = `Epic|${'b'.repeat(32)}|0`;
  const solo = (mmr: number, extra: Record<string, unknown> = {}) => ({
    ...rank(mmr),
    kind: 'solo',
    playerId: epicId,
    name: 'Bob Solo',
    ...extra,
  });
  const soloPseudo = (pseudo: string | null, playerId: string | null = null, member = 'member-bob') =>
    env.DB.prepare('UPDATE members SET solo_pseudo = ?, solo_player_id = ? WHERE id = ?')
      .bind(pseudo, playerId, member)
      .run();
  const soloRank = () =>
    env.DB.prepare(
      "SELECT player_id AS playerId, mmr, tier, division, matches_played AS matches, status, peak_mmr AS peak FROM solo_ranks WHERE player = 'bob'",
    ).first();
  const learnedId = () =>
    env.DB.prepare("SELECT solo_player_id FROM members WHERE id = 'member-bob'").first('solo_player_id');

  test('are listed by pseudo, with the platform prefix, until the rank source finds them', async () => {
    await soloPseudo('Bob Solo');
    await env.DB.prepare("UPDATE members SET solo_pseudo = 'Carla Solo' WHERE id = 'member-carla'").run();
    const { targets } = await (await call('/api/ranks/targets')).json<{ targets: unknown[] }>();
    expect(targets).toEqual([
      { player: 'bob', kind: 'duo', playerId: 'Epic|bob-test|0' },
      { player: 'bob', kind: 'solo', platform: 'Epic', name: 'Bob Solo', playerId: null },
      { player: 'carla', kind: 'solo', platform: 'PS4', name: 'Carla Solo', playerId: null },
    ]);
    await post([solo(1320, { name: 'bob solo' })]);
    const after = await (await call('/api/ranks/targets')).json<{ targets: unknown[] }>();
    expect(after.targets).toContainEqual({
      player: 'bob',
      kind: 'solo',
      platform: 'Epic',
      name: 'Bob Solo',
      playerId: epicId,
    });
  });

  test('a reading found from the pseudo stores the account, its rank and its peak, apart from the duo', async () => {
    await soloPseudo('Bob Solo');
    const answer = await post([rank(1180), solo(1320, { matches: 210, tier: 17, division: 1 })], []);
    expect(await answer.json()).toEqual({ ok: true, changed: 2, ignored: 0 });
    expect(await learnedId()).toBe(epicId);
    expect(await soloRank()).toEqual({
      playerId: epicId,
      mmr: 1320,
      tier: 17,
      division: 1,
      matches: 210,
      status: 'ready',
      peak: 1320,
    });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM solo_mmr_entries').first('n')).toBe(1);
    expect(await env.DB.prepare("SELECT mmr FROM player_ranks WHERE player = 'bob'").first('mmr')).toBe(1180);
    expect(await (await post([solo(1320, { tier: 17, division: 1 })])).json()).toEqual({
      ok: true,
      changed: 0,
      ignored: 0,
    });
    await post([solo(1300)]);
    expect(await soloRank()).toMatchObject({ mmr: 1300, matches: 210, peak: 1320 });
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM solo_mmr_entries').first('n')).toBe(2);
  });

  test("the account found from the pseudo is confirmed as the member's: its matches count as theirs", async () => {
    await soloPseudo('Bob Solo');
    await post([solo(1320)]);
    const aliases = () =>
      env.DB.prepare('SELECT player_id, slot, confirmed_by FROM player_identity_aliases')
        .all()
        .then((r) => r.results);
    expect(await aliases()).toEqual([{ player_id: epicId, slot: 'bob', confirmed_by: 'member-bob' }]);
    await post([solo(1300)]);
    expect(await aliases()).toHaveLength(1);
  });

  test('an account another player already confirmed stays theirs', async () => {
    await soloPseudo('Bob Solo');
    await env.DB.prepare(
      "INSERT INTO player_identity_aliases VALUES (?, 'alice', 'member-alice', '2026-11-01T10:00:00.000Z')",
    )
      .bind(epicId)
      .run();
    await post([solo(1320)]);
    expect(await learnedId()).toBe(epicId);
    expect(await env.DB.prepare('SELECT slot FROM player_identity_aliases').all()).toMatchObject({
      results: [{ slot: 'alice' }],
    });
  });

  test('an account still in its placement matches says how many it played, until it is placed', async () => {
    await soloPseudo('Bob Solo');
    const placing = { tier: 16, division: null, placements: 3 };
    await post([{ ...rank(1150), ...placing }, solo(1154, placing)]);
    const [bob] = await readDoublesRanks(env.DB, ['bob']);
    expect(bob).toMatchObject({ label: 'Champion I', placements: 3, solo: { label: 'Champion I', placements: 3 } });
    await post([rank(1160), solo(1170)]);
    const [placed] = await readDoublesRanks(env.DB, ['bob']);
    expect(placed).toMatchObject({ placements: null, solo: { placements: null } });
  });

  test('a wrong placement count goes unshown, it never refuses the readings', async () => {
    expect(await (await post([{ ...rank(1180), placements: 42 }])).json()).toEqual({
      ok: true,
      changed: 1,
      ignored: 0,
    });
    expect((await readDoublesRanks(env.DB, ['bob']))[0]?.placements).toBeNull();
  });

  test('a reading the profile no longer names is dropped, never the duo ranks with it', async () => {
    await soloPseudo('Bob Solo');
    const answer = await post([
      rank(1180),
      solo(1320, { name: 'Old Pseudo' }),
      solo(1320, { playerId: 'PS4|123456|0' }),
      solo(1320, { player: 'alice' }),
      solo(20_000),
      { ...solo(1320), kind: 'trio' },
    ]);
    expect(await answer.json()).toEqual({ ok: true, changed: 1, ignored: 5 });
    expect(await learnedId()).toBeNull();
    expect(await soloRank()).toBeNull();
    await soloPseudo('Bob Solo', `Epic|${'c'.repeat(32)}|0`);
    expect(await (await post([solo(1320)])).json()).toMatchObject({ ignored: 1 });
    expect(await soloRank()).toBeNull();
  });

  test('an account another member already holds is not handed over', async () => {
    await soloPseudo('Bob Solo');
    await soloPseudo('Alice Solo', epicId, 'member-alice');
    expect(await (await post([solo(1320)])).json()).toMatchObject({ ignored: 1 });
    expect(await learnedId()).toBeNull();
  });

  test('an account the source could not read says why, and keeps its last known rank', async () => {
    await soloPseudo('Bob Solo');
    const unresolved = (reason: string, name = 'Bob Solo') => ({
      player: 'bob',
      kind: 'solo',
      platform: 'Epic',
      name,
      reason,
    });
    await post([], [unresolved('not_found')]);
    expect(await soloRank()).toMatchObject({ playerId: null, mmr: null, status: 'not_found' });
    expect(
      await (await post([], [unresolved('read_failed', 'Old Pseudo'), unresolved('sleeping')])).json(),
    ).toMatchObject({ ignored: 2 });
    expect(await soloRank()).toMatchObject({ status: 'not_found' });
    await post([solo(1320)]);
    await post([], [unresolved('read_failed')]);
    expect(await soloRank()).toMatchObject({ playerId: epicId, mmr: 1320, status: 'read_failed' });
  });

  test('a solo peak is its own, and starts over with a new season', async () => {
    await soloPseudo('Bob Solo');
    await post([rank(1500), solo(1320)]);
    await env.DB.prepare("UPDATE solo_ranks SET season = ? WHERE player = 'bob'")
      .bind(currentSeason.number - 1)
      .run();
    await post([solo(1200)]);
    expect(await soloRank()).toMatchObject({ peak: 1200 });
    expect(await env.DB.prepare("SELECT peak_mmr FROM player_ranks WHERE player = 'bob'").first('peak_mmr')).toBe(1500);
  });

  test('a solo account’s best rating stays across seasons, rises with a higher reading, and goes with the account', async () => {
    await soloPseudo('Bob Solo');
    const best = () => env.DB.prepare("SELECT best_mmr FROM solo_ranks WHERE player = 'bob'").first('best_mmr');
    await post([solo(1320)]);
    expect(await best()).toBe(1320);
    await env.DB.prepare("UPDATE solo_ranks SET best_mmr = 1560, season = ? WHERE player = 'bob'")
      .bind(currentSeason.number - 1)
      .run();
    await post([solo(1400)]);
    expect(await best()).toBe(1560);
    await post([solo(1580)]);
    expect(await best()).toBe(1580);
    await saveOwnProfile(env.DB, 'member-bob', { duoPseudo: 'bob', soloPseudo: 'Bob Other', platform: 'pc' });
    expect(await best()).toBeNull();
  });

  test('a solo account’s best rating keeps the rank it came with, and one set by hand has none', async () => {
    await soloPseudo('Bob Solo');
    const bestRank = async () => (await readDoublesRanks(env.DB, ['bob']))[0]?.solo?.bestRank;
    await post([solo(1320, { tier: 17, division: 4 })]);
    expect(await bestRank()).toEqual({ mmr: 1320, label: 'Champion II · Division IV', tier: 17 });
    await post([solo(1300, { tier: 17, division: 3 })]);
    expect(await bestRank()).toEqual({ mmr: 1320, label: 'Champion II · Division IV', tier: 17 });
    await env.DB.prepare(
      "UPDATE solo_ranks SET best_mmr = 1560, best_tier = NULL, best_division = NULL WHERE player = 'bob'",
    ).run();
    expect(await bestRank()).toBeNull();
    await post([solo(1580, { tier: 20, division: 1 })]);
    expect(await bestRank()).toEqual({ mmr: 1580, label: 'Grand Champion II · Division I', tier: 20 });
  });

  test('the health of the source only follows the duo accounts', async () => {
    await soloPseudo('Bob Solo');
    await post([solo(1320)]);
    expect((await readRankSourceHealth(env.DB)).lastReadAt).toBeNull();
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

  test('is given with the activity, so a source can tell a reading already happened', async () => {
    const activity = async () => (await call('/api/ranks/activity')).json();
    expect(await activity()).toEqual({ lastRankedMatchAt: null, lastReadAt: null });
    const observedAt = new Date().toISOString();
    await post([rank(1180, observedAt)]);
    expect(await activity()).toEqual({ lastRankedMatchAt: null, lastReadAt: observedAt });
  });

  test('ignores ranks the players entered themselves', async () => {
    await env.DB.prepare(
      "INSERT INTO player_ranks (player, player_id, mmr, fetched_at, last_attempt, status) VALUES ('bob', 'Epic|bob-test|0', 1180, ?1, ?1, 'manual')",
    )
      .bind(new Date().toISOString())
      .run();
    expect((await readRankSourceHealth(env.DB)).stale).toBe(true);
  });
});
