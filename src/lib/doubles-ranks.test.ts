import { env } from 'cloudflare:workers';
import { expect, test } from 'vitest';
import { roster } from './club-fixture';
import { doublesRankLabel, readDoublesRanks } from './doubles-ranks';

const [, second = ''] = roster;

function secondTarget<T>(targets: T[]): T {
  const target = targets[1];
  if (!target) throw new Error('expected a second roster player');
  return target;
}

test('official rank names, divisions I to IV, SSL and placements', () => {
  expect(doublesRankLabel({ tier: 17, division: 2, placementMatches: 10 })).toBe('Champion II · Division II');
  expect(doublesRankLabel({ tier: 1, division: 4, placementMatches: null })).toBe('Bronze I · Division IV');
  expect(doublesRankLabel({ tier: 22, division: null, placementMatches: null })).toBe('Légende supersonique');
  expect(doublesRankLabel({ tier: 0, division: null, placementMatches: null })).toBe('Non classé');
  expect(doublesRankLabel({ tier: 12, division: 1, placementMatches: 3 })).toBe('Non classé · Placement 3/10');
  expect(doublesRankLabel({ tier: 99, division: null, placementMatches: null })).toBe('Classement non reçu');
});

test('D1: the last rank is kept and marked historical without network access', async () => {
  await env.DB.prepare('DELETE FROM player_ranks').run();
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO player_ranks (player,player_id,playlist,mmr,tier,division,placement_matches,fetched_at,last_attempt,status) VALUES (?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(second, 'Epic|synthetic|0', 11, 1200, 17, 2, 10, now, now, 'frozen')
    .run();
  const rank = secondTarget(await readDoublesRanks(env.DB, roster));
  expect(rank.mmr).toBe(1200);
  expect(rank.label).toBe('Champion II · Division II');
  expect(rank.status).toBe('frozen');
  expect(rank.fetchedAt).toBe(now);
});
