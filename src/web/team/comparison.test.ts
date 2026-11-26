import { expect, test } from 'vitest';
import type { SeasonMmr } from '../../lib/contract';
import type { GameStats } from '../../lib/game-stats';
import { anExercise, aRank, aResult, aSoloRank, boardWith } from '../test-utils';
import {
  bestOf,
  comparedPlayers,
  keyStats,
  prizes,
  ranked,
  seasonsPlayed,
  type TableMode,
  tableStats,
} from './comparison';

// The Stats page compares the players over one season: S23 from 10 June, S24 from 23 September 2026.

/** A match of Alice and Bob together, won or lost, on a day of a season. */
const duo = (guid: string, day: string, won: boolean, parts: { alice: number; bob: number }, extra = {}) =>
  (['alice', 'bob'] as const).map((name) =>
    aResult({
      match_guid: guid,
      name,
      day,
      received: `${day}T20:00:00Z`,
      winner: won ? 0 : 1,
      goals: parts[name],
      ...extra,
    }),
  );

const peak = (mmr: number, tier: number) => ({ mmr, label: 'Champion I · Division II', tier });

const board = boardWith({
  results: [
    ...duo('s23-win', '2026-08-20', true, { alice: 1, bob: 3 }),
    ...duo('s24-win', '2026-11-02', true, { alice: 2, bob: 0 }, { blue_goals: 2, orange_goals: 0, overtime: true }),
    ...duo('s24-loss', '2026-11-03', false, { alice: 1, bob: 0 }, { blue_goals: 1, orange_goals: 3, forfeit: true }),
    // Charlie plays alone, in S24 only, at 1 in the morning, and leaves.
    aResult({ match_guid: 'night', name: 'charlie', day: '2026-11-04', received: '2026-11-04T00:30:00Z', left: true }),
  ],
  doublesRanks: [
    aRank({ player: 'alice', tier: 16, solo: aSoloRank({ pseudo: 'alice-en-solo', playerId: 'Epic|alice-solo|0' }) }),
    aRank({ player: 'bob', tier: 19 }),
  ],
  exercises: [
    anExercise({ id: 'a1', player: 'alice', count: 40, day: '2026-11-02', created: '2026-11-02T21:00:00Z' }),
    anExercise({
      id: 'a2',
      player: 'alice',
      type: 'plank',
      count: 60,
      day: '2026-11-03',
      created: '2026-11-03T21:00:00Z',
    }),
    anExercise({ id: 'a3', player: 'alice', count: 100, day: '2026-08-20', created: '2026-08-20T21:00:00Z' }),
  ],
});
const seasons: SeasonMmr[] = [
  { player: 'alice', account: 'duo', season: 24, first: 1100, last: 1180, peak: peak(1250, 16) },
  { player: 'alice', account: 'solo', season: 24, first: 1000, last: 980, peak: peak(1040, 15) },
  { player: 'alice', account: 'duo', season: 23, first: 1000, last: 1090, peak: peak(1120, 15) },
  { player: 'bob', account: 'duo', season: 24, first: 1300, last: 1290, peak: peak(1330, 17) },
];
const roster = ['alice', 'bob', 'charlie'];
/** Everyone of the roster over season 24, as the page compares them. */
const everyone = () => comparedPlayers(board, seasons, roster, 'alice', 'all', 'all', 24);
const statNamed = (label: string, mode: TableMode = 'total') => {
  const stat = tableStats('doubles', mode, everyone()).find((candidate) => candidate.label === label);
  if (!stat) throw new Error(`${label} is in the table`);
  return stat;
};

test('offers the seasons the club played or was read in, the newest first', () => {
  expect(seasonsPlayed(board, seasons, roster)).toEqual([24, 23]);
});

test('counts each player’s matches of the season chosen, the member first', () => {
  const players = comparedPlayers(board, seasons, roster, 'bob', 'all', 'all', 24);
  expect(players.map((player) => [player.name, player.career.matches, player.career.goals])).toEqual([
    ['bob', 2, 0],
    ['alice', 2, 3],
    ['charlie', 1, 0],
  ]);
  expect(comparedPlayers(board, seasons, roster, 'bob', 'all', 'all', 23)[0]?.career.goals).toBe(3);
  expect(comparedPlayers(board, seasons, roster, 'bob', 'all', 'all', null)[0]?.career.matches).toBe(3);
});

test('takes the 2v2 peak of the account that climbed highest, and what the season brought it', () => {
  const [alice] = comparedPlayers(board, seasons, roster, 'alice', 'all', 'all', 24);
  expect(alice?.mmr).toEqual({ account: 'duo', peak: peak(1250, 16), gained: 80, fall: 70 });
  const [solo] = comparedPlayers(board, seasons, roster, 'alice', 'all', 'solo', 24);
  expect(solo?.mmr).toMatchObject({ account: 'solo', gained: -20, fall: 60 });
  // Every season: the highest peak, the seasons' gains added up.
  const [always] = comparedPlayers(board, seasons, roster, 'alice', 'all', 'duo', null);
  expect(always?.mmr).toMatchObject({ peak: peak(1250, 16), gained: 170, fall: 70 });
  expect(comparedPlayers(board, seasons, roster, 'alice', 'all', 'all', 24)[2]?.mmr).toBe(null);
});

test('counts the season’s exercises in pushups', () => {
  const [alice] = comparedPlayers(board, seasons, roster, 'alice', 'all', 'all', 24);
  // 40 pushups, and a minute of plank worth 15.
  expect(alice?.pushups).toBe(55);
});

test('reads the endings of the matches: goals conceded, overtimes, forfeits, matches left, late nights', () => {
  const players = comparedPlayers(board, seasons, roster, 'alice', 'all', 'all', 24);
  const row = (label: string) => players.map((player) => statNamed(label).value(player));
  expect(row('Buts encaissés')).toEqual([3, 3, null]);
  expect(row('Clean sheets')).toEqual([1, 1, null]);
  expect(row('Prolongations gagnées')).toEqual([1, 1, 0]);
  expect(row('FF donnés')).toEqual([1, 1, 0]);
  expect(row('Matchs quittés')).toEqual([0, 0, 1]);
  expect(row('Matchs après minuit')).toEqual([0, 0, 1]);
});

test('ranks the players, ties sharing the lead and those without a figure last', () => {
  const players = comparedPlayers(board, seasons, ['alice', 'bob', 'charlie', 'dana'], 'alice', 'all', 'all', 24);
  const wins = ranked(statNamed('Victoires', 'perMatch'), players);
  expect(wins.lines.map((line) => [line.player.name, line.value])).toEqual([
    ['alice', 50],
    ['bob', 50],
    ['charlie', 0],
    ['dana', null],
  ]);
  expect(wins.leaders.map((line) => line.player.name)).toEqual(['alice', 'bob']);
  // A tie shares its place; the next player comes after both.
  expect(wins.lines.map((line) => line.place)).toEqual([1, 1, 3, null]);

  const goals = keyStats.find((stat) => stat.label === 'Buts / match');
  if (!goals) throw new Error('Buts / match is a key stat');
  expect(ranked(goals, players).leaders.map((line) => [line.player.name, line.value])).toEqual([['alice', 1.5]]);
  expect(prizes.map((prize) => prize.prize)).toContain('Le noctambule');
});

test('the table lights the best figure of a line, the lowest when less is better, none when all are equal', () => {
  const players = comparedPlayers(board, seasons, roster, 'alice', 'all', 'all', 24);
  expect(bestOf(statNamed('Buts'), players)).toBe(3);
  expect(bestOf(statNamed('Matchs quittés'), players)).toBe(0);
  expect(bestOf(statNamed('Clean sheets'), players)).toBe(null);
  expect(tableStats('tournament', 'total', everyone()).map((stat) => stat.label)).toContain('Tournois gagnés');
  expect(tableStats('doubles', 'total', everyone()).map((stat) => stat.label)).not.toContain('Tournois gagnés');
  // No collector 0.7.0 match in this season: none of its lines.
  expect(tableStats('doubles', 'total', everyone()).map((stat) => stat.label)).not.toContain('Tirs');
});

test('per match, an action is averaged, a win or an MVP becomes a share, an ending or a record stays a count', () => {
  const players = comparedPlayers(board, seasons, roster, 'alice', 'all', 'all', 24);
  const row = (label: string) => players.map((player) => statNamed(label, 'perMatch').value(player));
  expect(row('Buts')).toEqual([1.5, 0, 0]);
  // Charlie lost his only match: he left it.
  expect(row('Victoires')).toEqual([50, 50, 0]);
  // A late night or a match left reads best as a count.
  expect(row('Prolongations gagnées')).toEqual([1, 1, 0]);
  expect(row('Matchs quittés')).toEqual([0, 0, 1]);
  expect(row('Win streak max')).toEqual([1, 1, 0]);
  // Only the matches that came with a final score count: Charlie's has none.
  expect(row('Buts encaissés')).toEqual([1.5, 1.5, null]);
  expect(statNamed('Buts', 'perMatch').format).toBe('perMatch');
  expect(statNamed('Buts', 'perMatch').section).toBe('Attaque');
  expect(statNamed('Matchs quittés', 'perMatch').perMatch).toBe(false);
  expect(statNamed('MVP', 'perMatch').format).toBe('percent');
  // A score of hundreds reads whole, per match too.
  expect(statNamed('Score', 'perMatch').format).toBe('count');
});

test('names a player by their solo pseudo when only the solo accounts are compared', () => {
  const shown = (account: 'all' | 'duo' | 'solo') =>
    comparedPlayers(board, seasons, roster, 'alice', 'all', account, 24).map((player) => player.shown);
  expect(shown('solo')).toEqual(['alice-en-solo', 'bob', 'charlie']);
  expect(shown('all')).toEqual(['alice', 'bob', 'charlie']);
  expect(shown('duo')).toEqual(['alice', 'bob', 'charlie']);
});

test('adds up the stats of collector 0.7.0, names the game’s events, and lines the assists up by scorer', () => {
  const stats = (alice: GameStats, bob: GameStats) =>
    (['alice', 'bob'] as const).map((name) =>
      aResult({
        match_guid: `m-${JSON.stringify([alice, bob]).length}`,
        name,
        day: '2026-11-05',
        received: '2026-11-05T20:00:00Z',
        winner: 0,
        goals: name === 'alice' ? 2 : 1,
        game_stats: name === 'alice' ? alice : bob,
      }),
    );
  const withGame = boardWith({
    results: [
      ...stats(
        {
          shots: 4,
          touches: 30,
          kickoffTouches: 2,
          statfeed: { Save: 1, AerialGoal: 1, BicycleHit: 2, MVP: 1, Win: 1, Mystery: 1 },
          fastestGoal: 116.3,
          statfeedSecondary: { Demolish: 2 },
          assistsTo: { 'Epic|bob|0': 1 },
          hardestHit: 2500,
          longestGoal: 4000,
          quickestGoal: 9.5,
        },
        { shots: 2, touches: 20, kickoffTouches: 1, statfeed: {}, hardestHit: 3000, quickestGoal: 12 },
      ),
      // A match of an older collector: it counts in the matches, not in these stats.
      ...stats({}, {}).map((row) => ({ ...row, match_guid: 'older', game_stats: null })),
    ],
  });
  const players = comparedPlayers(withGame, [], ['alice', 'bob'], 'alice', 'all', 'all', 24);
  // The game's words follow the language it was played in: English here.
  const table = tableStats('all', 'total', players, { BicycleHit: 'Bicycle Hit', Mystery: 'Mystery Event' });
  const row = (label: string) => {
    const stat = table.find((candidate) => candidate.label === label);
    if (!stat) throw new Error(`${label} is in the table`);
    return players.map((player) => stat.value(player));
  };
  expect(row('Tirs')).toEqual([4, 2]);
  // Alice: 2 goals on 4 shots; the goals of the older match do not count against her shots.
  expect(row('Précision des tirs')).toEqual([50, 50]);
  expect(row('Premiers au coup d’envoi')).toEqual([2, 1]);
  expect(row('But aérien')).toEqual([1, 0]);
  expect(row('Retourné')).toEqual([2, 0]);
  // An event the app does not know keeps the game's words.
  expect(row('Mystery Event')).toEqual([1, 0]);
  expect(row('But le plus rapide')).toEqual([116.3, null]);
  expect(row('Subi : Démolition')).toEqual([2, 0]);
  expect(row('Pour bob')).toEqual([1, null]);
  expect(row('Pour alice')).toEqual([null, 0]);
  expect(row('Frappe la plus puissante')).toEqual([2500, 3000]);
  expect(row('But le plus rapide après le coup d’envoi')).toEqual([9.5, 12]);
  // A save already has its line, from the scoreboard.
  // Their own line already counts them: the game's MVP and Win are not lined up again.
  for (const double of ['Arrêt', 'Victoire', 'Save', 'Win'])
    expect(table.map((stat) => stat.label)).not.toContain(double);
  expect(table.filter((stat) => stat.label === 'MVP')).toHaveLength(1);
  // Per match, over the matches that came with them.
  const perMatch = tableStats('all', 'perMatch', players).find((stat) => stat.label === 'Touches de balle');
  expect(players.map((player) => perMatch?.value(player))).toEqual([30, 20]);
  const punchingBall = prizes.find((prize) => prize.prize === 'Le punching-ball');
  expect(players.map((player) => punchingBall?.value(player))).toEqual([2, 0]);
});

test('measures each account’s peak of the season against its peak all time before the season', () => {
  const ranked = boardWith({
    results: [],
    doublesRanks: [
      aRank({
        player: 'alice',
        seasonStartBest: { mmr: 1200, label: 'Champion II · Division III', tier: 17 },
        // Her solo best, set by hand: no rank of its own.
        solo: aSoloRank({ pseudo: 'alice-en-solo', seasonStartBest: { mmr: 1100, label: '', tier: null } }),
      }),
      aRank({ player: 'bob' }),
    ],
  });
  const gaps = (kind: 'solo' | 'duo', season: number | null) =>
    comparedPlayers(ranked, seasons, ['alice', 'bob'], 'alice', 'all', 'all', season).map((player) => {
      const gap = player.peakGaps[kind];
      return gap && [gap.peak, gap.allTime, gap.gap];
    });
  // Alice's duo beat its best before the season (1 200) by 50; her solo stayed 60 under its (1 100).
  expect(gaps('duo', 24)).toEqual([
    [1250, 1200, 50],
    // Bob's duo was read this season, but its best before it is unknown.
    [1330, null, null],
  ]);
  expect(gaps('solo', 24)).toEqual([[1040, 1100, -60], null]);
  // A past season measures against the seasons before it the app read: none before season 23.
  expect(gaps('duo', 23)).toEqual([[1120, null, null], null]);
  expect(gaps('duo', null)).toEqual([null, null]);
  // A best set by hand takes the colour of the rank it reaches on the ladder.
  const [alice] = comparedPlayers(ranked, seasons, ['alice'], 'alice', 'all', 'all', 24);
  expect(alice?.peakGaps.solo?.allTimeTier).toBeGreaterThan(0);
  expect(alice?.peakGaps.duo?.allTimeTier).toBe(17);
  expect(alice?.soloShown).toBe('alice-en-solo');
});
