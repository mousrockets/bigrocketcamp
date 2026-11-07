import { expect, test } from 'vitest';
import { roster } from './club-fixture';
import { matchHistory } from './match-history';
import { matchIndex } from './match-rules';

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
  const [match] = matchHistory(rows, rows, matchIndex(rows), roster, undefined, [
    { effectiveFrom: '2026-11-06', enabled: false },
  ]);
  expect(match?.forfeit).toBe(true);
  expect(match?.players.map(({ pushups, dodged }) => [pushups, dodged])).toEqual([
    [0, false],
    [0, false],
  ]);
});
