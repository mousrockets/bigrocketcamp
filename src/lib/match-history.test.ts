import { expect, test } from 'vitest';
import { roster } from './club-fixture';
import { matchHistory, partiedAccounts } from './match-history';
import { defaultDodgeRules, matchIndex } from './match-rules';

const [alice = '', bob = '', carla = ''] = roster;
const line = (match: string, name: string, team: number, winner: number, score: number, goals = 0) => ({
  match_guid: match,
  player_id: `Epic|${name}|0`,
  name,
  day: '2026-11-06',
  kind: 'match',
  team,
  winner,
  score,
  goals,
  received: `2026-11-06T21:${match === 'late' ? '30' : '10'}:00.000Z`,
});

const scoreboard = [
  line('late', alice, 0, 1, 300, 1),
  line('late', bob, 0, 1, 150),
  line('late', 'Opponent 1', 1, 1, 400, 2),
  line('late', 'Opponent 2', 1, 1, 350, 1),
  line('early', alice, 0, 0, 500, 2),
  line('early', 'Mate', 0, 0, 200, 1),
  line('early', 'Opponent 3', 1, 0, 100),
];
const club = scoreboard.filter((row) => roster.includes(row.name));

test('one entry per match, newest first, with the score and what each club player owes', () => {
  const history = matchHistory(club, scoreboard, matchIndex(scoreboard), roster);
  expect(history.map((match) => [match.guid, match.outcome, match.score])).toEqual([
    ['late', 'defeat', [1, 3]],
    ['early', 'victory', [3, 0]],
  ]);
  const [late] = history;
  expect(late?.players.map(({ row, pushups, lastPlace }) => [row.name, pushups, lastPlace])).toEqual([
    [alice, 5, false],
    [bob, 10, true],
  ]);
  expect(late?.received).toBe('2026-11-06T21:30:00.000Z');
});

test('a match between club members, and one to check, say so', () => {
  const versus = [line('versus', alice, 0, 0, 300, 1), line('versus', carla, 1, 0, 200)];
  expect(matchHistory(versus, versus, matchIndex(versus), roster)[0]?.outcome).toBe('between-members');
  const doubtful = [{ ...line('doubt', alice, 0, 1, 100), review_required: true }];
  const [match] = matchHistory(doubtful, doubtful, matchIndex(doubtful), roster);
  expect([match?.outcome, match?.players[0]?.pushups]).toEqual(['review', 0]);
});

test('a scoreboard without goals shows no score', () => {
  const { goals: _goals, ...withoutGoals } = line('old', alice, 0, 1, 100);
  const rows = [withoutGoals];
  expect(matchHistory(rows, rows, matchIndex(rows), roster)[0]?.score).toBeNull();
});

test('a scoreboard received whole with a side short of a player says that someone left', () => {
  const forfeit = [
    line('forfeit', alice, 0, 0, 300, 2),
    line('forfeit', bob, 0, 0, 250, 1),
    line('forfeit', 'Opponent 1', 1, 0, 100),
  ];
  const full = scoreboard.filter((row) => row.match_guid === 'late');
  const rows = [...forfeit, ...full];
  const rosters = [
    { match_guid: 'forfeit', expected_players: 3 },
    { match_guid: 'late', expected_players: 4 },
  ];
  const history = matchHistory(
    rows.filter((row) => roster.includes(row.name)),
    rows,
    matchIndex(rows, rosters),
    roster,
  );
  expect(history.map((match) => [match.guid, match.left])).toEqual([
    ['forfeit', true],
    ['late', false],
  ]);
  // Leaving changes nothing to what the match costs.
  expect(history[0]?.players.map(({ pushups }) => pushups)).toEqual([0, 0]);
});

test('without a scoreboard received whole, a short side is not taken for a departure', () => {
  const clubOnly = [line('old', alice, 0, 1, 100), line('old', bob, 0, 1, 50)];
  const [match] = matchHistory(clubOnly, clubOnly, matchIndex(clubOnly), roster);
  expect(match?.left).toBe(false);
});

test('a forfeit and an overtime are told on the match, and a forfeit won takes 5 off', () => {
  const ended = (match: string, winner: number, ending: { forfeit: boolean | null; overtime: boolean | null }) =>
    [line(match, alice, 0, winner, 300, 1), line(match, bob, 0, winner, 100)].map((row) => ({ ...row, ...ending }));
  const rows = [
    ...ended('ff', 0, { forfeit: true, overtime: false }),
    ...ended('ot', 1, { forfeit: false, overtime: true }),
    ...ended('older', 0, { forfeit: null, overtime: null }),
  ];
  const history = matchHistory(rows, rows, matchIndex(rows), roster);
  expect(history.map((match) => [match.guid, match.forfeit, match.overtime])).toEqual([
    ['ff', true, false],
    ['ot', false, true],
    ['older', false, false],
  ]);
  expect(history.map((match) => match.players.map(({ pushups, dodged }) => [pushups, dodged]))).toEqual([
    [
      [-5, true],
      [-5, true],
    ],
    [
      [5, false],
      [10, false],
    ],
    [
      [0, false],
      [0, false],
    ],
  ]);
});

test('a forfeit won the day the club keeps no −5 costs nothing and dodges nothing', () => {
  const rows = [line('ff', alice, 0, 0, 300, 1), line('ff', bob, 0, 0, 100)].map((row) => ({
    ...row,
    forfeit: true,
  }));
  const [match] = matchHistory(rows, rows, matchIndex(rows), roster, undefined, {
    ...defaultDodgeRules,
    forfeit: [{ effectiveFrom: '2026-11-06', enabled: false }],
  });
  expect(match?.forfeit).toBe(true);
  expect(match?.players.map(({ pushups, dodged }) => [pushups, dodged])).toEqual([
    [0, false],
    [0, false],
  ]);
});

test('from 1000 points, a club player dodges 10, win or loss, on top of what the match costs', () => {
  const tonight = (row: ReturnType<typeof line>) => ({ ...row, day: '2026-11-07' });
  const rows = [
    line('loss', alice, 0, 1, 1240, 2),
    line('loss', bob, 0, 1, 1001),
    line('win', alice, 0, 0, 1000, 1),
    line('win', bob, 0, 0, 1500, 2),
  ].map(tonight);
  const history = matchHistory(rows, rows, matchIndex(rows), roster);
  expect(
    history.map((match) =>
      match.players.map(({ row, pushups, lastPlace, highScore }) => [row.name, pushups, lastPlace, highScore]),
    ),
  ).toEqual([
    [
      [alice, -5, false, true],
      [bob, 0, true, true],
    ],
    [
      [alice, -10, false, true],
      [bob, -10, false, true],
    ],
  ]);
  const before = matchHistory(
    rows.slice(0, 1).map((row) => ({ ...row, day: '2026-11-06' })),
    rows,
    matchIndex(rows),
    roster,
  );
  expect(before[0]?.players.map(({ pushups, highScore }) => [pushups, highScore])).toEqual([[5, false]]);
});

test('the goals of an opponent who left stay in the score of an overtime', () => {
  const rows = [
    { ...line('overtime', alice, 0, 0, 700, 4), overtime: true },
    { ...line('overtime', bob, 0, 0, 400, 2), overtime: true },
    { ...line('overtime', 'Opponent 1', 1, 0, 300), overtime: true },
    { ...line('overtime', 'Opponent 2', 1, 0, 600, 5), left: true },
  ];
  const club = rows.filter((row) => roster.includes(row.name));
  const [match] = matchHistory(club, rows, matchIndex(rows), roster);
  expect([match?.overtime, match?.score]).toEqual([true, [6, 5]]);
});

test('the teams’ goals as the game counted them make the score, the club’s first', () => {
  // Orange's scorer left: only the game's count still has his 5 goals.
  const final = { overtime: true, blue_goals: 6, orange_goals: 5 };
  const rows = [
    { ...line('counted', alice, 0, 0, 700, 4), ...final },
    { ...line('counted', bob, 0, 0, 400, 2), ...final },
    { ...line('counted', 'Opponent 1', 1, 0, 300), ...final },
  ];
  const club = rows.filter((row) => roster.includes(row.name));
  expect(matchHistory(club, rows, matchIndex(rows), roster)[0]?.score).toEqual([6, 5]);
  // The same match with the club in orange: a defeat 5-6.
  const orange = rows.map((row) => ({ ...row, team: 1 - row.team }));
  const clubInOrange = orange.filter((row) => roster.includes(row.name));
  expect(matchHistory(clubInOrange, orange, matchIndex(orange), roster)[0]?.score).toEqual([5, 6]);
});

test('a player seen both leaving and on the final scoreboard scores once', () => {
  const rows = [
    line('back', alice, 0, 0, 500, 2),
    { ...line('back', alice, 0, 1, 200, 1), left: true },
    line('back', 'Opponent 1', 1, 0, 100, 1),
  ];
  const [match] = matchHistory(rows.slice(0, 1), rows, matchIndex(rows), roster);
  expect(match?.score).toEqual([2, 1]);
});

test('a club player who left: a defeat of 5 apart from the final scoreboard, which still decides the match', () => {
  // Bob left the early match, with the fewest points: Alice and her mate won it without him.
  const gone = { ...line('early', bob, 0, 1, 50, 3), left: true };
  const rows = [...scoreboard, gone];
  const matches = matchIndex(rows, [{ match_guid: 'early', expected_players: 3 }]);
  expect(matches.get('early')?.complete).toBe(true);
  const [, early] = matchHistory([...club, gone], rows, matches, roster);
  // His 3 goals still count.
  expect([early?.outcome, early?.score, early?.left]).toEqual(['victory', [6, 0], true]);
  expect(early?.players.map(({ row, pushups, left, lastPlace }) => [row.name, pushups, left, lastPlace])).toEqual([
    [alice, 0, false, false],
    [bob, 5, true, false],
  ]);
  // Known from his own departure alone: a defeat, and no score.
  const alone = [{ ...line('alone', carla, 1, 0, 1200, 1), left: true }];
  const [match] = matchHistory(alone, alone, matchIndex(alone), roster, undefined, defaultDodgeRules);
  expect([match?.outcome, match?.score, match?.players[0]?.pushups]).toEqual(['defeat', null, 5]);
});

test('a group: a club teammate at once, a stranger teammate from the second of three matches in a row on the same account', () => {
  const match = (guid: string, minute: number, mate: string) =>
    [line(guid, alice, 0, 0, 300), line(guid, mate, 0, 0, 200), line(guid, `Opponent ${guid}`, 1, 0, 100)].map(
      (row) => ({ ...row, received: `2026-11-06T20:${minute}:00.000Z` }),
    );
  const rows = [
    ...match('c', 30, 'Friend'),
    ...match('a', 10, 'Friend'),
    ...match('b', 20, 'Friend'),
    ...match('d', 40, 'Stranger'),
    ...match('e', 50, 'Stranger'),
    ...match('f', 55, bob),
  ];
  const partied = partiedAccounts(rows, roster);
  const aliceId = `Epic|${alice}|0`;
  expect(['a', 'b', 'c', 'd', 'e', 'f'].map((guid) => partied.get(guid)?.has(aliceId) ?? false)).toEqual([
    false,
    true,
    true,
    false,
    false,
    true,
  ]);
  expect(partied.get('f')?.has(`Epic|${bob}|0`)).toBe(true);
  // A stranger of the other team is never a group.
  expect(partied.get('b')?.size).toBe(1);
});
