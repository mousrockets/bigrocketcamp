import { expect, test } from 'vitest';
import type { SeasonMmr } from '../../lib/contract';
import type { GameStats } from '../../lib/game-stats';
import { aResult as aLine, anExercise, aRank, aSoloRank, boardWith } from '../test-utils';
import type { StatsMode } from './career';
import {
  bestOf,
  comparedPlayers,
  keyStats,
  prizes,
  ranked,
  seasonsPlayed,
  styleAxes,
  styleOf,
  styleSpan,
  tableStats,
} from './comparison';

// The Stats page compares the players over one season: S23 from 10 June, S24 from 23 September 2026.

/** A line of a ranked 2v2, unless the test says otherwise: the page counts the ranked matches and the tournaments. */
const aResult = (parts: Parameters<typeof aLine>[0]) => aLine({ playlist: 11, ...parts });
const every = new Set<StatsMode>([
  'duel',
  'doubles',
  'standard',
  'tournament-duel',
  'tournament-doubles',
  'tournament-standard',
]);
const only = (...modes: StatsMode[]) => new Set(modes);
const inSeason = (season: number | null) => (season === null ? null : new Set([season]));

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
const everyone = () => comparedPlayers(board, seasons, roster, 'alice', every, 'all', inSeason(24));
const statNamed = (label: string) => {
  const stat = tableStats(only('doubles'), everyone()).find((candidate) => candidate.label === label);
  if (!stat) throw new Error(`${label} is in the table`);
  return stat;
};

test('offers the seasons the club played or was read in, the newest first', () => {
  expect(seasonsPlayed(board, seasons, roster)).toEqual([24, 23]);
});

test('counts each player’s matches of the season chosen, the member first', () => {
  const players = comparedPlayers(board, seasons, roster, 'bob', every, 'all', inSeason(24));
  expect(players.map((player) => [player.name, player.career.matches, player.career.goals])).toEqual([
    ['bob', 2, 0],
    ['alice', 2, 3],
    ['charlie', 1, 0],
  ]);
  expect(comparedPlayers(board, seasons, roster, 'bob', every, 'all', inSeason(23))[0]?.career.goals).toBe(3);
  expect(comparedPlayers(board, seasons, roster, 'bob', every, 'all', inSeason(null))[0]?.career.matches).toBe(3);
});

test('takes the 2v2 peak of the account that climbed highest, and how far it fell from it', () => {
  const [alice] = comparedPlayers(board, seasons, roster, 'alice', every, 'all', inSeason(24));
  expect(alice?.mmr).toEqual({ account: 'duo', peak: peak(1250, 16), fall: 70 });
  const [solo] = comparedPlayers(board, seasons, roster, 'alice', every, 'solo', inSeason(24));
  expect(solo?.mmr).toMatchObject({ account: 'solo', fall: 60 });
  // Every season: the highest peak, and the worst fall of a season.
  const [always] = comparedPlayers(board, seasons, roster, 'alice', every, 'duo', inSeason(null));
  expect(always?.mmr).toMatchObject({ peak: peak(1250, 16), fall: 70 });
  expect(comparedPlayers(board, seasons, roster, 'alice', every, 'all', inSeason(24))[2]?.mmr).toBe(null);
});

test('counts the season’s exercises in pushups', () => {
  const [alice] = comparedPlayers(board, seasons, roster, 'alice', every, 'all', inSeason(24));
  // 40 pushups, and a minute of plank worth 15.
  expect(alice?.pushups).toBe(55);
});

test('reads the endings of the matches as rates, each with its total: conceded, overtimes, forfeits, departures', () => {
  const players = comparedPlayers(board, seasons, roster, 'alice', every, 'all', inSeason(24));
  const row = (label: string) => {
    const stat = statNamed(label);
    return players.map((player) => [stat.value(player), stat.total?.(player) ?? null]);
  };
  // Alice and Bob: 3 goals conceded over the 2 matches whose score is known, one of them without any.
  expect(row('Buts encaissés')).toEqual([
    [1.5, 3],
    [1.5, 3],
    [null, null],
  ]);
  expect(row('Clean sheets')).toEqual([
    [50, 1],
    [50, 1],
    [null, null],
  ]);
  // Won among the overtimes played; Charlie played none.
  expect(row('Prolongations gagnées')).toEqual([
    [100, 1],
    [100, 1],
    [null, 0],
  ]);
  expect(players.map((player) => statNamed('Prolongations gagnées').of?.(player))).toEqual([1, 1, 0]);
  expect(row('FF donnés')).toEqual([
    [50, 1],
    [50, 1],
    [0, 0],
  ]);
  expect(row('Matchs quittés')).toEqual([
    [0, 0],
    [0, 0],
    [100, 1],
  ]);
  // A late night is a count of its own.
  expect(row('Matchs après minuit')).toEqual([
    [0, null],
    [0, null],
    [1, null],
  ]);
  // What another line already says has no line of its own: the defeats, the overtimes lost.
  const labels = tableStats(only('doubles'), everyone()).map((stat) => stat.label);
  expect(labels).not.toContain('Défaites');
  expect(labels).not.toContain('Prolongations perdues');
});

test('ranks the players, ties sharing the lead and those without a figure last', () => {
  const players = comparedPlayers(
    board,
    seasons,
    ['alice', 'bob', 'charlie', 'dana'],
    'alice',
    every,
    'all',
    inSeason(24),
  );
  const wins = ranked(statNamed('Victoires'), players);
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
  const players = comparedPlayers(board, seasons, roster, 'alice', every, 'all', inSeason(24));
  expect(bestOf(statNamed('Buts'), players)).toBe(1.5);
  expect(bestOf(statNamed('Matchs quittés'), players)).toBe(0);
  expect(bestOf(statNamed('Clean sheets'), players)).toBe(null);
  expect(tableStats(only('tournament-doubles'), everyone()).map((stat) => stat.label)).toContain('Tournois gagnés');
  expect(tableStats(only('doubles'), everyone()).map((stat) => stat.label)).not.toContain('Tournois gagnés');
  // No collector 0.7.0 match in this season: none of its lines.
  expect(tableStats(only('doubles'), everyone()).map((stat) => stat.label)).not.toContain('Tirs');
});

test('an action reads per match, a win or an MVP as a share, each with its total; a streak stays a count', () => {
  const players = comparedPlayers(board, seasons, roster, 'alice', every, 'all', inSeason(24));
  const row = (label: string) => players.map((player) => statNamed(label).value(player));
  expect(row('Buts')).toEqual([1.5, 0, 0]);
  expect(players.map((player) => statNamed('Buts').total?.(player))).toEqual([3, 0, 0]);
  // Charlie lost his only match: he left it.
  expect(row('Victoires')).toEqual([50, 50, 0]);
  expect(row('Win streak max')).toEqual([1, 1, 0]);
  // Only the matches that came with a final score count: Charlie's has none.
  expect(row('Buts encaissés')).toEqual([1.5, 1.5, null]);
  expect(statNamed('Buts').format).toBe('perMatch');
  expect(statNamed('Buts').section).toBe('Attaque');
  expect(statNamed('Win streak max').perMatch).toBe(false);
  expect(statNamed('Win streak max').total).toBeUndefined();
  expect(statNamed('MVP').format).toBe('percent');
  // A score of hundreds reads whole, per match too.
  expect(statNamed('Score').format).toBe('count');
});

test('leads with the time spent on the game, then attack, team play, defence and the MVPs', () => {
  expect(keyStats.map((stat) => stat.label)).toEqual([
    'Matchs',
    'Buts / match',
    'Passes D / match',
    'Arrêts / match',
    'Taux de MVP',
  ]);
});

test('places each player’s style against the club’s own, with no winner', () => {
  const styled = boardWith({
    results: [
      aResult({ match_guid: 's1', name: 'alice', goals: 4, saves: 2, assists: 2 }),
      aResult({ match_guid: 's1', name: 'bob', goals: 1, saves: 4, assists: 1 }),
    ],
  });
  const players = comparedPlayers(styled, [], ['alice', 'bob', 'charlie'], 'alice', every, 'all', inSeason(null));
  const [goalsPerSave, assistsPerGoal] = styleAxes;
  if (!goalsPerSave || !assistsPerGoal) throw new Error('two axes');
  // The club: 5 goals for 6 saves. Alice scores twice what she saves.
  const { club, lines } = styleOf(goalsPerSave, players);
  expect(club).toBeCloseTo(5 / 6);
  expect(lines.map((line) => line.ratio)).toEqual([2, 0.25, null]);
  // Twice the club's lean and more: at the end, as Bob's, who saves four times what he scores.
  expect(lines[0]?.position).toBe(0.97);
  expect(lines[1]?.position).toBe(0.03);
  // Charlie played no match: no dot.
  expect(lines[2]?.position).toBeNull();
  // A pass for every two goals, a little less than the club's 3 for 5: Alice leans towards Finisseur.
  expect(styleOf(assistsPerGoal, players).lines[0]?.position).toBeCloseTo(
    0.5 + Math.log(0.5 / 0.6) / (2 * Math.log(styleSpan)),
  );
});

test('counts the ranked matches and the tournaments by their size, and a match of unknown playlist by its size', () => {
  const line = (guid: string, playlist: number | null, team = 0, name = 'alice') =>
    aResult({ match_guid: guid, name, player_id: `Epic|${name}|0`, team, day: '2026-11-05', playlist });
  const played = boardWith({
    results: [
      line('ranked', 11),
      line('casual', 2),
      line('private', 6),
      line('hoops', 27),
      // A tournament's size is its biggest team, a player who left included.
      line('cup-2v2', 34),
      line('cup-2v2', 34, 0, 'bob'),
      line('cup-2v2', 34, 1, 'rival'),
      line('cup-3v3', 22),
      line('cup-3v3', 22, 1, 'rival'),
      line('cup-3v3', 22, 1, 'rival-2'),
      line('cup-3v3', 22, 1, 'rival-3'),
      // Received before the app kept playlists: the size of a scoreboard a source confirmed tells the mode.
      line('old-2v2', null),
      line('old-3v3', null),
      // A 2v2 whose two opponents left ends with two players: Alice and Bob were still a team of two.
      line('old-forfeit', null),
      line('old-forfeit', null, 0, 'bob'),
      // A 2v2 whose player left ends with three.
      line('old-leaver', null),
      // No scoreboard confirmed: no mode.
      line('old-unknown', null),
    ],
    matchRosters: [
      { match_guid: 'old-2v2', expected_players: 4 },
      { match_guid: 'old-3v3', expected_players: 6 },
      { match_guid: 'old-forfeit', expected_players: 2 },
      { match_guid: 'old-leaver', expected_players: 3 },
    ],
  });
  const matches = (modes: ReadonlySet<StatsMode>) =>
    comparedPlayers(played, [], ['alice'], 'alice', modes, 'all', null)[0]?.career.matches;
  expect(matches(only('doubles'))).toBe(4);
  expect(matches(only('standard'))).toBe(1);
  expect(matches(only('duel'))).toBe(0);
  expect(matches(only('tournament-doubles'))).toBe(1);
  expect(matches(only('tournament-standard'))).toBe(1);
  expect(matches(only('doubles', 'tournament-doubles'))).toBe(5);
  // Every mode of the list: neither casual, private nor extra modes, nor a match of unknown mode.
  expect(matches(every)).toBe(7);
});

test('names a player by their solo pseudo when only the solo accounts are compared', () => {
  const shown = (account: 'all' | 'duo' | 'solo') =>
    comparedPlayers(board, seasons, roster, 'alice', every, account, inSeason(24)).map((player) => player.shown);
  expect(shown('solo')).toEqual(['alice-en-solo', 'bob', 'charlie']);
  expect(shown('all')).toEqual(['alice', 'bob', 'charlie']);
  expect(shown('duo')).toEqual(['alice', 'bob', 'charlie']);
});

test('a prize of something that happens in a match goes to its rate, its count beside it', () => {
  const ending = (guid: string, name: string, parts: Partial<Parameters<typeof aResult>[0]>) =>
    aResult({ match_guid: guid, name, blue_goals: 2, orange_goals: 1, ...parts });
  const played = boardWith({
    results: [
      // Alice: three overtimes, two won; two clean sheets in four matches.
      ending('o1', 'alice', { winner: 0, overtime: true, orange_goals: 0 }),
      ending('o2', 'alice', { winner: 0, overtime: true, orange_goals: 0 }),
      ending('o3', 'alice', { winner: 1, overtime: true }),
      ending('o4', 'alice', { winner: 0 }),
      ending('o5', 'alice', { winner: 0 }),
      // Bob: one overtime won, too few to crown him, and a single match: too few for a rate's prize.
      ending('o1', 'bob', { winner: 0, overtime: true }),
    ],
  });
  const players = comparedPlayers(played, [], ['alice', 'bob'], 'alice', every, 'all', inSeason(null));
  const prize = (name: string) => {
    const found = prizes.find((candidate) => candidate.prize === name);
    if (!found) throw new Error(`${name} is a prize`);
    return players.map((player) => [found.value(player), found.total?.(player) ?? null]);
  };
  expect(prize('Le roi des prolongations')).toEqual([
    [(2 / 3) * 100, 2],
    [null, 1],
  ]);
  expect(prize('Le mur')).toEqual([
    [40, 2],
    [null, 0],
  ]);
  expect(prize('Le fugueur')).toEqual([
    [0, 0],
    [null, 0],
  ]);
  // The one who fell furthest from the season's peak jumped from highest.
  expect(prizes.map((candidate) => candidate.prize)).toContain('Le parachutiste');
  // A night owl plays many nights: that one stays a count.
  expect(prizes.find((candidate) => candidate.prize === 'Le noctambule')?.total).toBeUndefined();
});

test('the posts crown per match, over five matches at least: who plays most does not win them', () => {
  const posts = (name: string, hits: (number | null)[]) =>
    hits.map((crossbar_hits, index) => aResult({ match_guid: `${name}-${index}`, name, crossbar_hits }));
  const played = boardWith({
    results: [
      // Alice hit 8 posts in 8 matches; an older collector sent no count for a ninth, which does not lower her average.
      ...posts('alice', [3, 1, 0, 0, 1, 2, 0, 1, null]),
      // Bob, 10 in 5: he wins it.
      ...posts('bob', [2, 2, 2, 2, 2]),
      // Charlie, 3 in 1: too few matches to take it.
      ...posts('charlie', [3]),
    ],
  });
  const players = comparedPlayers(played, [], ['alice', 'bob', 'charlie'], 'alice', every, 'all', inSeason(null));
  const posted = prizes.find((prize) => prize.prize === 'L’abonné aux montants');
  expect(players.map((player) => posted?.value(player))).toEqual([1, 2, null]);
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
  const players = comparedPlayers(withGame, [], ['alice', 'bob'], 'alice', every, 'all', inSeason(24));
  // The game's words follow the language it was played in: English here.
  const table = tableStats(every, players, { BicycleHit: 'Bicycle Hit', Mystery: 'Mystery Event' });
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
  const perMatch = tableStats(every, players).find((stat) => stat.label === 'Touches de balle');
  expect(players.map((player) => perMatch?.value(player))).toEqual([30, 20]);
  // The demolitions taken count per match, over the matches that came with the game's feed: one each here, too few
  // for the prize.
  const punchingBall = prizes.find((prize) => prize.prize === 'Le punching-ball');
  expect(punchingBall?.format).toBe('perMatch');
  expect(players.map((player) => punchingBall?.value(player))).toEqual([null, null]);
  expect(row('Subi : Démolition')).toEqual([2, 0]);
});

test('counts the MVP the game named, else the best score of the winners, among the matches whose MVP is known', () => {
  const line = (guid: string, name: string, parts: Partial<Parameters<typeof aLine>[0]> = {}) =>
    aResult({ match_guid: guid, name, player_id: `Epic|${name}|0`, day: '2026-11-05', winner: 0, ...parts });
  const mvp = { shots: 3, statfeed: { MVP: 1 } };
  const played = boardWith({
    results: [
      // The game named Bob MVP, though Alice scored more.
      line('named', 'alice', { score: 600, game_stats: { shots: 4, statfeed: { Goal: 2 } } }),
      line('named', 'bob', { score: 500, game_stats: mvp }),
      // A whole scoreboard, from an older collector: the best score of the winners.
      line('whole', 'alice', { score: 700 }),
      line('whole', 'bob', { score: 400 }),
      line('whole', 'rival', { team: 1, score: 300 }),
      line('whole', 'rival-2', { team: 1, score: 200 }),
      // Won, but the scoreboard is not whole: nobody knows.
      line('partial', 'alice', { score: 900 }),
      // Lost: no MVP among the losers.
      line('lost', 'alice', { winner: 1 }),
    ],
    matchRosters: [{ match_guid: 'whole', expected_players: 4 }],
  });
  const players = comparedPlayers(played, [], ['alice', 'bob'], 'alice', every, 'all', null);
  const rate = keyStats.find((stat) => stat.label === 'Taux de MVP');
  if (!rate) throw new Error('Taux de MVP is a key stat');
  expect(players.map((player) => [player.career.mvps, player.career.measured.mvp])).toEqual([
    [1, 3],
    [1, 2],
  ]);
  expect(players.map((player) => rate.value(player))).toEqual([(1 / 3) * 100, 50]);
});

test('the 2v2 ratings only take a prize when the 2v2 is among the modes', () => {
  const fall = (modes: ReadonlySet<StatsMode>) => {
    const parachute = prizes.find((prize) => prize.prize === 'Le parachutiste');
    return comparedPlayers(board, seasons, roster, 'alice', modes, 'all', inSeason(24)).map(
      (player) => parachute?.value(player) ?? null,
    );
  };
  expect(fall(only('doubles'))[0]).not.toBeNull();
  expect(fall(only('standard', 'tournament-standard'))).toEqual([null, null, null]);
});
