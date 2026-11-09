import { env } from 'cloudflare:workers';
import { expect, test } from 'vitest';
import { joinTestClub, roster } from './club-fixture';
import { doublesRankLabel, readDoublesRanks } from './doubles-ranks';
import { currentSeason } from './season';

const [first = '', second = ''] = roster;

function secondTarget<T>(targets: T[]): T {
  const target = targets[1];
  if (!target) throw new Error('expected a second roster player');
  return target;
}

test('official rank names, divisions I to IV and SSL', () => {
  expect(doublesRankLabel({ tier: 17, division: 2 })).toBe('Champion II · Division II');
  expect(doublesRankLabel({ tier: 1, division: 4 })).toBe('Bronze I · Division IV');
  expect(doublesRankLabel({ tier: 22, division: null })).toBe('Légende supersonique');
  expect(doublesRankLabel({ tier: 0, division: null })).toBe('Non classé');
  expect(doublesRankLabel({ tier: 99, division: null })).toBe('Classement non reçu');
});

test('D1: the last rank is kept and marked historical without network access', async () => {
  await env.DB.prepare('DELETE FROM player_ranks').run();
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO player_ranks (player,player_id,mmr,tier,division,fetched_at,last_attempt,status) VALUES (?,?,?,?,?,?,?,?)',
  )
    .bind(second, 'Epic|synthetic|0', 1200, 17, 2, now, now, 'frozen')
    .run();
  const rank = secondTarget(await readDoublesRanks(env.DB, roster));
  expect(rank.mmr).toBe(1200);
  expect(rank.label).toBe('Champion II · Division II');
  expect(rank.status).toBe('frozen');
  expect(rank.fetchedAt).toBe(now);
});

test('each card shows the season peak, and the solo account its profile names, apart from the duo one', async () => {
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM player_ranks'),
    env.DB.prepare('DELETE FROM solo_ranks'),
    env.DB.prepare('UPDATE members SET solo_pseudo = NULL'),
    env.DB.prepare(
      'INSERT INTO player_ranks (player,player_id,mmr,tier,division,fetched_at,last_attempt,status,season,peak_mmr,peak_tier,peak_division) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    ).bind(second, 'Epic|synthetic|0', 1200, 17, 2, now, now, 'ready', currentSeason.number, 1310, 19, 1),
    env.DB.prepare(
      "INSERT INTO solo_ranks (player,player_id,mmr,tier,division,matches_played,fetched_at,status,season,peak_mmr,peak_tier,peak_division) VALUES (?,?,1330,19,2,40,?,'ready',?,1330,19,2)",
    ).bind(second, `Epic|${'d'.repeat(32)}|0`, now, currentSeason.number - 1),
  ]);
  await joinTestClub(env.DB);
  await env.DB.prepare('UPDATE members SET solo_pseudo = ? WHERE duo_pseudo IN (?, ?)')
    .bind('Solo', first, second)
    .run();
  const [firstRank, secondRank, thirdRank] = await readDoublesRanks(env.DB, roster);
  expect(secondRank?.peak).toEqual({ mmr: 1310, label: 'Grand Champion I · Division I', tier: 19 });
  expect(secondRank?.solo).toEqual({
    mmr: 1330,
    label: 'Grand Champion I · Division II',
    tier: 19,
    matchesPlayed: 40,
    status: 'ready',
    fetchedAt: now,
    peak: null,
    pseudo: 'Solo',
    best: null,
  });
  expect(firstRank?.solo).toMatchObject({ mmr: null, status: 'waiting', pseudo: 'Solo' });
  expect(thirdRank?.solo).toBeNull();
  await env.DB.prepare("INSERT INTO solo_ranks (player, status) VALUES (?, 'not_found')").bind(first).run();
  expect((await readDoublesRanks(env.DB, roster))[0]?.solo).toMatchObject({ mmr: null, status: 'not_found' });
});
