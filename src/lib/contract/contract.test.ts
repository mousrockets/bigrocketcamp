import { describe, expect, test } from 'vitest';
import { defaultForfeitRules, defaultHighScoreRules, defaultLastPlaceRules } from '../match-rules';
import { boardChanges, challengeRules, club, doublesRank, health, ruleChange } from '.';

// The app and the API may run different versions for a while: an answer parses whatever side is newer.

const me = {
  id: 'member-alice',
  email: 'alice@example.com',
  role: 'admin',
  duoPseudo: 'alice',
  soloPseudo: null,
  platform: 'pc',
  duoPseudoLocked: false,
};

const rank = {
  player: 'alice',
  mmr: 1234,
  label: 'Diamant II',
  tier: 15,
  matchesPlayed: 321,
  status: 'ready',
  fetchedAt: '2026-11-07T10:00:00.000Z',
  lastAttempt: null,
};

const result = {
  match_guid: 'synthetic-match',
  player_id: 'Epic|alice|0',
  name: 'alice',
  day: '2026-11-07',
  kind: 'match',
  team: 0,
  winner: 0,
  score: 420,
  goals: 2,
  assists: 1,
  saves: 3,
  received: '2026-11-07T10:00:00.000Z',
  review_required: false,
  verification: 'single',
  source_types: ['collector'],
  selected_source: 'collector',
  source_difference: null,
  expected_players: 4,
};

const changes = {
  viewer: 'viewer',
  version: 7,
  more: false,
  reset: true,
  results: [result],
  exercises: [],
  reactions: [],
  reactionsOf: 'all',
  removed: { results: [], exercises: [] },
  collectors: [{ id: 'live-1', last_seen: '2026-11-07T10:00:00.000Z' }],
  doublesRanks: [{ ...rank, peak: null, solo: null }],
  monthly: {
    startsMonth: '2026-11',
    current: {
      month: '2026-11',
      startAt: '2026-10-31T23:00:00.000Z',
      lastDay: '2026-11-30',
      lastDayStartAt: '2026-11-29T23:00:00.000Z',
      cutoffAt: '2026-11-30T23:00:00.000Z',
      rows: [],
      status: 'live',
      missing: [],
    },
    // A month closed before solo accounts counted: no account on its rows.
    closed: [
      {
        month: '2026-10',
        lastDay: '2026-10-31',
        cutoffAt: '2026-10-31T23:00:00.000Z',
        rows: [{ player: 'alice', mmr: 1200, recordedAt: '2026-10-31T20:00:00.000Z', confirmedForClose: true }],
        status: 'final',
        missing: [],
        closedAt: '2026-11-01T00:05:00.000Z',
      },
    ],
    allowedPlayers: ['alice'],
    debts: [],
  },
  rankSource: null,
  rules: { lastPlace: [{ enabled: true, effectiveFrom: '2026-11-06', ties: 'none' }] },
};

describe('an answer from an older API, without the fields added since, still parses', () => {
  test('a club without challenge rules: the default ones apply', () => {
    const read = club.parse({ name: 'Big Rocket Camp', logo: null, players: [], me });
    expect(read.rules).toBeUndefined();
  });

  test('a rank without season peak nor solo account', () => {
    expect(doublesRank.parse(rank)).toMatchObject({ peak: null, solo: null });
  });

  test('a board without rules gets the default ones', () => {
    const { rules: _rules, ...older } = changes;
    expect(boardChanges.parse(older).rules).toEqual({
      lastPlace: defaultLastPlaceRules,
      forfeit: [],
      highScore: defaultHighScoreRules,
    });
  });

  test('rules without the −10 above 1000 points: it applies from 2026-11-07, as the club decided', () => {
    expect(boardChanges.parse(changes).rules.highScore).toEqual(defaultHighScoreRules);
    const read = club.parse({ name: 'Big Rocket Camp', logo: null, players: [], me, rules: changes.rules });
    expect(read.rules?.highScore).toEqual([{ enabled: true, effectiveFrom: '2026-11-07' }]);
    const newer = { ...changes.rules, highScore: [{ enabled: false, effectiveFrom: '2026-11-08' }] };
    expect(challengeRules.parse(newer).highScore).toEqual(newer.highScore);
  });

  test('rules without the switch of the −5: it applies every day, as before', () => {
    expect(boardChanges.parse(changes).rules.forfeit).toEqual(defaultForfeitRules);
    const read = club.parse({ name: 'Big Rocket Camp', logo: null, players: [], me, rules: changes.rules });
    expect(read.rules?.forfeit).toEqual([]);
    const newer = { ...changes.rules, forfeit: [{ enabled: false, effectiveFrom: '2026-11-08' }] };
    expect(challengeRules.parse(newer).forfeit).toEqual(newer.forfeit);
  });

  test('a result without how its match ended: unknown', () => {
    expect(boardChanges.parse(changes).results[0]).toMatchObject({
      forfeit: null,
      overtime: null,
    });
    const newer = boardChanges.parse({ ...changes, results: [{ ...result, forfeit: true, overtime: false }] });
    expect(newer.results[0]).toMatchObject({ forfeit: true, overtime: false });
  });

  test('a health check without its deployment date', () => {
    expect(health.parse({ status: 'ok', commit: 'a1b2c3d' })).toMatchObject({ deployedAt: null });
  });
});

describe('a field a newer API adds is kept, so that a copy of the answer loses nothing', () => {
  test('on the answer and on the objects inside it', () => {
    const newer = {
      ...changes,
      streaks: [],
      results: [{ ...result, boost: 87 }],
      monthly: { ...changes.monthly, current: { ...changes.monthly.current, season: 21 } },
    };
    const read = boardChanges.parse(newer);
    expect(read).toMatchObject({ streaks: [], results: [{ boost: 87 }], monthly: { current: { season: 21 } } });
  });

  test('on a schema built from another one', () => {
    const read = club.parse({
      name: 'Big Rocket Camp',
      logo: null,
      players: [],
      me: { ...me, avatar: 'a.png' },
      theme: 1,
    });
    expect(read).toMatchObject({ theme: 1, me: { avatar: 'a.png' } });
  });
});

describe('a value a newer API adds to a closed list falls back to a known one', () => {
  test('on the board and on the club', () => {
    const read = boardChanges.parse({
      ...changes,
      results: [{ ...result, verification: 'disputed', source_difference: 'timing' }],
    });
    expect(read.results[0]).toMatchObject({ verification: 'single', source_difference: null });
    expect(doublesRank.parse({ ...rank, solo: { ...rank, status: 'banned', peak: null } }).solo?.status).toBe(
      'waiting',
    );
    expect(
      club.parse({ name: 'Big Rocket Camp', logo: null, players: [{ slot: 'alice', platform: 'stadia' }], me })
        .players[0]?.platform,
    ).toBeNull();
  });
});

describe('an answer without a field it always had breaks the contract', () => {
  test('a result without its match', () => {
    const { match_guid: _guid, ...broken } = result;
    expect(boardChanges.safeParse({ ...changes, results: [broken] }).success).toBe(false);
  });

  test('a club without its players', () => {
    expect(club.safeParse({ name: 'Big Rocket Camp', logo: null, me }).success).toBe(false);
  });
});

test('a change of rules names the +5, the −5, the −10, or several, and nothing else', () => {
  expect(ruleChange.parse({ forfeit: { enabled: false } })).toEqual({ forfeit: { enabled: false } });
  expect(ruleChange.parse({ highScore: { enabled: false } })).toEqual({ highScore: { enabled: false } });
  expect(ruleChange.safeParse({ highScore: { enabled: 'non' } }).success).toBe(false);
  const both = { lastPlace: { enabled: true }, forfeit: { enabled: false } };
  expect(ruleChange.parse(both)).toEqual(both);
  expect(ruleChange.safeParse({}).error?.issues[0]?.message).toBe('Règle des défis invalide.');
  expect(ruleChange.safeParse({ forfeit: { enabled: 'non' } }).success).toBe(false);
});
