import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, test } from 'vitest';
import { roster } from './club';
import { closeMonthlyMmr, monthlyRanking, readMonthlyMmr, recordMmr } from './monthly-mmr';
import { type PublicProfilePageOptions, publicProfileHtml } from './public-profile-fixture';
import { type PublicFetcher, type PublicProfile, parsePublicRank, publicProfiles, syncPublicMmr } from './public-ranks';

const now = Date.parse('2026-11-30T22:59:30Z');
const cutoff = Date.parse('2026-11-30T23:00:00Z');
const db = env.DB;

const htmlResponse = (html: string) => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });

function profileAt(index: number): PublicProfile {
  const profile = publicProfiles[index];
  if (!profile) throw Error(`The test roster needs at least ${index + 1} players.`);
  return profile;
}

function profileFor(url: string): PublicProfile {
  const profile = publicProfiles.find((candidate) => candidate.url === url);
  if (!profile) throw Error(`Unexpected URL ${url}`);
  return profile;
}

const pageFor = (url: string, options: PublicProfilePageOptions = {}) =>
  htmlResponse(publicProfileHtml(profileFor(url), options));

async function giveIdentitiesToPlayers() {
  await db.batch(
    roster.map((player, index) =>
      db
        .prepare('INSERT INTO player_identities (slot,owner,player_id) VALUES (?,?,?)')
        .bind(player, index === 0 ? 'current-user' : `member-${index}`, `Epic|private-synthetic-${index}|0`),
    ),
  );
}

const mmrEntries = async () =>
  (await db.prepare('SELECT * FROM mmr_entries').all<{ source: string; mmr: number }>()).results;

beforeEach(async () => {
  await db.batch(
    [
      'player_identities',
      'player_identity_aliases',
      'mmr_entries',
      'player_ranks',
      'public_mmr_sync',
      'monthly_mmr_results',
      'drink_debts',
    ].map((table) => db.prepare(`DELETE FROM ${table}`)),
  );
});

describe('parsePublicRank', () => {
  test('isolates the 2v2 rating, ignores estimates and reads the real date without running the page', () => {
    const profile = profileAt(0);
    const rank = parsePublicRank(publicProfileHtml(profile), profile, now);
    expect(rank.mmr).toBe(1500);
    expect(rank.tier).toBe(17);
    expect(rank.division).toBe(2);
    expect(rank.sourceAt).toBe('2026-11-30T22:59:00.000Z');
    expect(rank.sourceUrl).toBe(profile.url);
    expect((globalThis as { shouldNotExecute?: unknown }).shouldNotExecute).toBeUndefined();
    expect(parsePublicRank(publicProfileHtml(profile, { tier: 0 }), profile, now).division).toBeNull();
  });

  const ambiguousPages: [string, PublicProfilePageOptions][] = [
    ['another player', { handle: 'someone-else' }],
    ['another platform', { platform: 'Steam' }],
    ['another URL', { url: 'https://example.org/profile' }],
    ['missing date', { stamp: '' }],
    ['invalid date', { stamp: 'Feb/31/2026 22:59:00 GMT' }],
    ['old reading', { stamp: 'Nov/30/2026 22:40:00 GMT' }],
    ['future date', { stamp: 'Nov/30/2026 23:01:00 GMT' }],
    ['duplicated table', { duplicate: true }],
    ['empty MMR', { mmr: '' }],
    ['missing MMR', { mmr: '—' }],
    ['negative MMR', { mmr: -1 }],
    ['fractional MMR', { mmr: 1200.5 }],
    ['unknown rank', { tier: 23 }],
    ['unknown division', { division: 'V' }],
  ];
  test.each(ambiguousPages)('rejects an ambiguous page (%s) instead of inventing zero', (_name, options) => {
    const profile = profileAt(0);
    expect(() => parsePublicRank(publicProfileHtml(profile, options), profile, now)).toThrow();
  });

  test('ignores older season tables and rejects a selected season that is not the newest', () => {
    const profile = profileAt(0);
    const html = publicProfileHtml(profile);
    const withOlderSeason = html.replace(
      '<div class="block-body"',
      '<span class="season-selector" onclick="SelectSeason(37)">Season 23</span><div class="block-body"',
    );
    expect(parsePublicRank(withOlderSeason, profile, now).season).toBe(24);
    const withNewerSeason = html.replace(
      '<div class="block-body"',
      '<span class="season-selector" onclick="SelectSeason(39)">Season 25</span><div class="block-body"',
    );
    expect(() => parsePublicRank(withNewerSeason, profile, now)).toThrow();
  });
});

describe('syncPublicMmr', () => {
  test('reads only the public URLs, sends no stored identity, then updates cards and the monthly ranking', async () => {
    await giveIdentitiesToPlayers();
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher: PublicFetcher = async (url, init) => {
      calls.push({ url, init });
      const headers = new Headers(init.headers);
      expect(init.body).toBeUndefined();
      expect(headers.get('Authorization')).toBeNull();
      expect(headers.get('Cookie')).toBeNull();
      expect(JSON.stringify({ url, init })).not.toContain('private-synthetic');
      return pageFor(url, { mmr: 1500 - publicProfiles.indexOf(profileFor(url)) * 100 });
    };
    const result = await syncPublicMmr(db, { now, fetcher });
    expect(result.status).toBe('ready');
    expect(calls).toHaveLength(publicProfiles.length);
    const entries = await mmrEntries();
    expect(entries).toHaveLength(roster.length);
    expect(entries.every((entry) => entry.source === 'rlstats')).toBe(true);
    const rank = await db.prepare('SELECT status FROM player_ranks LIMIT 1').first<{ status: string }>();
    expect(rank?.status).toBe('public');

    // Give the synthetic readings the same reception clock as the remote reading.
    await db
      .prepare("UPDATE mmr_entries SET recorded_at=? WHERE source='rlstats'")
      .bind(new Date(now).toISOString())
      .run();
    const state = await readMonthlyMmr(db, 'current-user', now);
    expect(state.current.rows.map((row) => row.mmr)).toEqual(roster.map((_player, index) => 1500 - index * 100));
    expect(state.current.rows.every((row) => row.confirmedForClose && row.source === 'rlstats')).toBe(true);
    expect(JSON.stringify(state)).not.toContain('private-synthetic');

    await closeMonthlyMmr(db, cutoff + 300000);
    const debts = await db.prepare('SELECT count(*) AS n FROM drink_debts').first<{ n: number }>();
    expect(debts?.n).toBe(roster.length - 1);
  });

  test('concurrent requests and retries read the provider once per batch and never duplicate a reading', async () => {
    await giveIdentitiesToPlayers();
    let calls = 0;
    const fetcher: PublicFetcher = async (url) => {
      calls++;
      return pageFor(url);
    };
    await Promise.all([syncPublicMmr(db, { now, fetcher }), syncPublicMmr(db, { now, fetcher })]);
    expect(calls).toBe(publicProfiles.length);
    expect(await mmrEntries()).toHaveLength(roster.length);
    await syncPublicMmr(db, { now: now + 180000, fetcher });
    expect(calls).toBe(2 * publicProfiles.length);
    expect(await mmrEntries()).toHaveLength(roster.length);
  });

  test('an outage, a challenge page or an unexpected format keep the received values', async () => {
    await giveIdentitiesToPlayers();
    await syncPublicMmr(db, { now, fetcher: async (url) => pageFor(url) });
    const result = await syncPublicMmr(db, {
      now: now + 180000,
      fetcher: async (url) => {
        if (url === profileAt(0).url) return new Response('blocked', { status: 403 });
        if (url === profileAt(1).url) return htmlResponse('<html>Challenge</html>');
        return new Response('{}', { headers: { 'content-type': 'application/json' } });
      },
    });
    expect(result.status).toBe('unavailable');
    expect(result.errors).toHaveLength(publicProfiles.length);
    expect(await mmrEntries()).toHaveLength(roster.length);
    const rank = await db.prepare('SELECT mmr FROM player_ranks LIMIT 1').first<{ mmr: number }>();
    expect(rank?.mmr).toBe(1500);
  });

  test('an oversized body or a timed-out request writes no MMR', async () => {
    await giveIdentitiesToPlayers();
    const result = await syncPublicMmr(db, {
      now,
      fetcher: async (url) => {
        if (url === profileAt(0).url) return htmlResponse('x'.repeat(512001));
        throw Object.assign(Error('Timeout'), { name: 'TimeoutError' });
      },
    });
    expect(result.updated).toHaveLength(0);
    expect(result.errors).toHaveLength(publicProfiles.length);
    expect(result.errors?.slice(1).every((error) => error.error === 'Source publique trop lente.')).toBe(true);
    expect(await mmrEntries()).toHaveLength(0);
  });

  test('an older public reading does not replace a newer manual confirmation', async () => {
    await giveIdentitiesToPlayers();
    const player = roster[0] ?? '';
    await recordMmr(db, 'current-user', { id: crypto.randomUUID(), player, mmr: 1600 });
    const at = new Date(now).toISOString();
    await db.batch([
      db.prepare('UPDATE mmr_entries SET recorded_at=?').bind(at),
      db.prepare('UPDATE player_ranks SET fetched_at=?').bind(at),
    ]);
    await syncPublicMmr(db, { now, fetcher: async (url) => pageFor(url, { mmr: 1400 }) });
    const rank = await db.prepare('SELECT mmr FROM player_ranks WHERE player=?').bind(player).first<{ mmr: number }>();
    expect(rank?.mmr).toBe(1600);
    expect((await readMonthlyMmr(db, 'current-user', now)).current.rows[0]?.mmr).toBe(1600);
  });

  test('a public redirect is not followed and writes nothing', async () => {
    await giveIdentitiesToPlayers();
    const urls: string[] = [];
    const result = await syncPublicMmr(db, {
      now,
      fetcher: async (url, init) => {
        expect(init.redirect).toBe('manual');
        urls.push(url);
        return new Response(publicProfileHtml(profileFor(url)), {
          status: 302,
          headers: { location: 'https://another.example/profile', 'content-type': 'text/html' },
        });
      },
    });
    expect(urls).toEqual(publicProfiles.map((profile) => profile.url));
    expect(result.updated).toHaveLength(0);
    expect(await mmrEntries()).toHaveLength(0);
    expect(result.errors?.every((error) => error.error.includes('302'))).toBe(true);
  });
});

describe('monthlyRanking with public readings', () => {
  test('a reading taken before midnight may arrive during the grace period; later ones do not decide the month', () => {
    const source = roster.map((player, index) => ({
      player,
      mmr: 1500 - index * 100,
      source: 'rlstats',
      source_at: '2026-11-30T22:59:00.000Z',
      recorded_at: '2026-11-30T23:01:00.000Z',
    }));
    expect(monthlyRanking(source, '2026-11').status).toBe('final');
    const afterMidnight = source.map((entry) => ({ ...entry, source_at: '2026-11-30T23:00:00.000Z' }));
    expect(monthlyRanking(afterMidnight, '2026-11').status).toBe('incomplete');
    const receivedTooLate = source.map((entry) => ({ ...entry, recorded_at: '2026-11-30T23:05:00.001Z' }));
    expect(monthlyRanking(receivedTooLate, '2026-11').status).toBe('incomplete');
    const tooOld = source.map((entry) => ({ ...entry, source_at: '2026-11-30T22:44:59.999Z' }));
    expect(monthlyRanking(tooOld, '2026-11').status).toBe('incomplete');
  });

  test('a public reading outside the final window does not hide an admissible manual confirmation', () => {
    const manual = roster.map((player, index) => ({
      player,
      mmr: 1500 - index * 100,
      source: 'manual',
      recorded_at: '2026-11-30T22:40:00.000Z',
    }));
    const publicOld = {
      player: roster[0] ?? '',
      mmr: 1000,
      source: 'rlstats',
      source_at: '2026-11-30T22:44:00.000Z',
      recorded_at: '2026-11-30T22:55:00.000Z',
    };
    const closed = monthlyRanking([...manual, publicOld], '2026-11');
    expect(closed.status).toBe('final');
    expect(closed.rows.find((row) => row.player === roster[0])?.mmr).toBe(1500);
    expect(closed.debts[0]?.payer).toBe(roster.at(-1));
    const live = monthlyRanking([...manual, publicOld], '2026-11', { live: true });
    expect(live.rows.find((row) => row.player === roster[0])?.mmr).toBe(1000);
  });
});
