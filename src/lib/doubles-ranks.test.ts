import { env } from 'cloudflare:workers';
import { expect, test } from 'vitest';
import { roster } from './club';
import { doublesRankLabel, normalizeDoublesSkill, rankTargets, readDoublesRanks } from './doubles-ranks';

const [, second = ''] = roster;
const skill = { Playlist: 11, Mu: 55, MMR: 55, Tier: 17, Division: 1, PlacementMatchesPlayed: 10 };
const response = (s: Record<string, unknown>) => ({
  Skills: [{ ...skill, Playlist: 10, Mu: 80, Tier: 22 }, s, { ...skill, Playlist: 13, Mu: 20, Tier: 10 }],
});
const rows = [{ name: second, kind: 'match', player_id: 'Epic|synthetic|0' }];

function secondTarget<T>(targets: T[]): T {
  const target = targets[1];
  if (!target) throw new Error('expected a second roster player');
  return target;
}

test('only the ranked 2v2: Champion II, API division 1 => Division II, Mu 55 => 1200 MMR', () => {
  const rank = normalizeDoublesSkill(response(skill));
  expect(rank).toEqual({ playlist: 11, mmr: 1200, tier: 17, division: 2, placementMatches: 10 });
  expect(doublesRankLabel(rank)).toBe('Champion II Division II');
  expect(normalizeDoublesSkill(response({ ...skill, Mu: 55.025 })).mmr).toBe(1201);
  for (const value of [{ Skills: [] }, { Skills: [{ ...skill, Playlist: 2 }] }, { Skills: [skill, skill] }, {}]) {
    expect(() => normalizeDoublesSkill(value)).toThrow();
  }
});

test('official ranks, divisions I to IV and SSL without an invented division', () => {
  const tiers: [number, string][] = [
    [1, 'Bronze I'],
    [4, 'Argent I'],
    [7, 'Or I'],
    [10, 'Platine I'],
    [13, 'Diamant I'],
    [16, 'Champion I'],
    [19, 'Grand Champion I'],
  ];
  for (const [tier, label] of tiers) {
    for (let division = 0; division < 4; division++) {
      const rank = normalizeDoublesSkill({ Skills: [{ ...skill, Tier: tier, Division: division }] });
      expect(doublesRankLabel(rank)).toMatch(new RegExp(`^${label} Division `));
      expect(rank.division).toBe(division + 1);
    }
  }
  const ssl = normalizeDoublesSkill({ Skills: [{ ...skill, Tier: 22, Division: null }] });
  expect(ssl.division).toBe(null);
  expect(doublesRankLabel(ssl)).toBe('Légende supersonique');
});

test('placement and missing MMR are told apart; nothing is invented as zero or last season rank', () => {
  const rank = normalizeDoublesSkill({ Skills: [{ ...skill, PlacementMatchesPlayed: 3 }] });
  expect(doublesRankLabel(rank)).toBe('Non classé · Placement 3/10');
  expect(rank.division).toBe(null);
  const empty = normalizeDoublesSkill({
    Skills: [{ Playlist: 11, Mu: null, Tier: 0, Division: null, PlacementMatchesPlayed: 0 }],
  });
  expect(empty.mmr).toBe(null);
  expect(doublesRankLabel(empty)).toMatch(/^Non classé/);
  expect(normalizeDoublesSkill({ Skills: [{ ...skill, Mu: -5 }] }).mmr).toBe(0);
});

test('non-finite numbers, strings, unknown tiers or divisions and invalid placements are rejected', () => {
  const patches: Record<string, unknown>[] = [
    { Mu: null },
    { Mu: '55' },
    { Mu: Number.POSITIVE_INFINITY },
    { Mu: Number.NaN },
    { Tier: null },
    { Tier: 23 },
    { Tier: -1 },
    { Division: 4 },
    { Division: -1 },
    { Division: null },
    { PlacementMatchesPlayed: -1 },
    { PlacementMatchesPlayed: 11 },
    { PlacementMatchesPlayed: '10' },
  ];
  for (const patch of patches) expect(() => normalizeDoublesSkill({ Skills: [{ ...skill, ...patch }] })).toThrow();
});

test('a linked identity wins; an ambiguous nickname is blocked; PSN and PS4 are equivalent', () => {
  expect(secondTarget(rankTargets(rows, [], 'owner')).playerId).toBe('Epic|synthetic|0');
  const ambiguous = [...rows, { name: second, kind: 'match', player_id: 'Epic|other|0' }];
  expect(secondTarget(rankTargets(ambiguous, [], 'owner')).conflict).toBe(true);
  expect(
    secondTarget(
      rankTargets(
        [{ name: second, kind: 'match', player_id: 'Epic|synthetic|0', source_difference: 'identity' }],
        [],
        'owner',
      ),
    ).conflict,
  ).toBe(true);
  expect(
    secondTarget(rankTargets(ambiguous, [{ slot: second, owner: 'owner', account_id: 'linked' }], 'owner')).playerId,
  ).toBe('Epic|linked|0');
  expect(
    secondTarget(rankTargets(ambiguous, [{ slot: second, owner: 'another-member', account_id: 'linked' }], 'owner'))
      .playerId,
  ).toBe('Epic|linked|0');
  const platforms = [
    { name: second, kind: 'match', player_id: 'PSN|synthetic|0' },
    { name: second, kind: 'match', player_id: 'PS4|synthetic|0' },
  ];
  expect(secondTarget(rankTargets(platforms, [], 'owner')).playerId).toBe('PS4|synthetic|0');
});

test('D1: the last rank is kept and marked historical without network access', async () => {
  await env.DB.prepare('DELETE FROM player_ranks').run();
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO player_ranks (player,player_id,playlist,mmr,tier,division,placement_matches,fetched_at,last_attempt,status) VALUES (?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(second, 'Epic|synthetic|0', 11, 1200, 17, 2, 10, now, now, 'frozen')
    .run();
  const rank = secondTarget(await readDoublesRanks(env.DB));
  expect(rank.mmr).toBe(1200);
  expect(rank.label).toBe('Champion II Division II');
  expect(rank.status).toBe('frozen');
  expect(rank.fetchedAt).toBe(now);
});
