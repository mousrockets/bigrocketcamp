import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, test } from 'vitest';
import { joinTestClub, roster } from '../lib/club-fixture';
import { summarize } from '../lib/domain';
import { rankedDoublesPlaylist } from '../lib/live-stats';
import { readStoredResults } from '../lib/match-builds';
import { sha256 } from './auth';

// Players who leave a match before its end, as the collectors of alice and bob send them: a 2v2 of the club
// against two fictional opponents.

const origin = 'http://localhost';
const ids = {
  alice: `Epic|${'b'.repeat(32)}|0`,
  bob: `Epic|${'c'.repeat(32)}|0`,
  'Opponent 1': `Epic|${'d'.repeat(32)}|0`,
  'Opponent 2': `Epic|${'e'.repeat(32)}|0`,
};
type Name = keyof typeof ids;

const line = (name: Name, score = 300) => ({
  Name: name,
  PrimaryId: ids[name],
  TeamNum: name.startsWith('Opponent') ? 1 : 0,
  Score: score,
  Goals: 0,
  Assists: 0,
  Saves: 0,
});

const teams = [
  { Name: 'Blue', TeamNum: 0, Score: 2 },
  { Name: 'Orange', TeamNum: 1, Score: 1 },
];

/** The club's team won; `present` are the players on the final scoreboard. */
function ended(guid: string, present: ReturnType<typeof line>[], departures?: ReturnType<typeof line>[]) {
  const now = Date.now();
  return {
    state: {
      MatchGuid: guid,
      Players: present,
      Game: { PlaylistId: rankedDoublesPlaylist, Teams: teams, bHasWinner: true, bReplay: false, Winner: 'Blue' },
    },
    end: { MatchGuid: guid, WinnerTeamNum: 0 },
    startedAt: now - 360_000,
    endedAt: now - 1000,
    seenIds: Object.values(ids),
    ...(departures ? { departures } : {}),
  };
}

function left(guid: string, players: ReturnType<typeof line>[]) {
  const now = Date.now();
  return {
    left: true,
    state: {
      MatchGuid: guid,
      Players: players,
      Game: { PlaylistId: rankedDoublesPlaylist, Teams: teams, bReplay: false },
    },
    startedAt: now - 360_000,
    leftAt: now - 120_000,
    seenIds: players.map((player) => player.PrimaryId),
  };
}

async function signIn(slot: 'alice' | 'bob'): Promise<string> {
  const token = `session-${crypto.randomUUID()}`;
  await env.DB.prepare('INSERT INTO sessions (token_hash, member_id, expires) VALUES (?, ?, ?)')
    .bind(await sha256(token), `member-${slot}`, Date.now() + 60_000)
    .run();
  return `session=${token}`;
}

async function send(slot: 'alice' | 'bob', body: unknown) {
  const response = await exports.default.fetch(`${origin}/api/live`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: await signIn(slot), Origin: origin },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json<Record<string, unknown>>() };
}

const rowsOf = (guid: string) =>
  env.DB.prepare(
    'SELECT name, team, winner, score, left_early, expected_players, verification, forfeit FROM match_results WHERE match_guid = ? ORDER BY name',
  )
    .bind(guid)
    .all()
    .then((result) => result.results);

const departuresOf = (guid: string) =>
  env.DB.prepare('SELECT player_id FROM match_departures WHERE match_guid = ? ORDER BY player_id')
    .bind(guid)
    .all<{ player_id: string }>()
    .then((result) => result.results.map((row) => row.player_id));

async function owed(guid: string) {
  const rows = (await readStoredResults(env.DB)).filter((row) => row.match_guid === guid);
  const rosters = rows.flatMap((row) =>
    row.expected_players === null ? [] : [{ match_guid: row.match_guid, expected_players: row.expected_players }],
  );
  return Object.fromEntries(summarize(roster, rows, [], '', rosters).map((player) => [player.name, player.due]));
}

beforeEach(async () => {
  await env.DB.batch(
    [
      'sessions',
      'player_identities',
      'player_identity_aliases',
      'result_observations',
      'source_reports',
      'match_departures',
      'match_results',
      'members',
    ].map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
  );
  await joinTestClub(env.DB);
  for (const slot of ['alice', 'bob'] as const) {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO player_identities (slot, owner, player_id) VALUES (?, ?, ?)').bind(
        slot,
        `member-${slot}`,
        ids[slot],
      ),
      env.DB.prepare('INSERT INTO player_identity_aliases VALUES (?, ?, ?, ?)').bind(
        ids[slot],
        slot,
        `member-${slot}`,
        'synthetic',
      ),
    ]);
  }
});

describe('departures', () => {
  test('a member who leaves before the end loses: 5 pushups, no bonus nor credit, once from both collectors', async () => {
    // bob leaves with 1200 points; alice wins without him, her collector sees him go.
    const everyone = [line('alice', 200), line('bob', 1200), line('Opponent 1'), line('Opponent 2')];
    const quit = await send('bob', left('Match-Left', everyone));
    expect(quit).toEqual({ status: 200, body: { ok: true, match: 'match-left', received: 1 } });
    const finished = await send(
      'alice',
      ended('Match-Left', [line('alice', 200), line('Opponent 1'), line('Opponent 2')], [line('bob', 1200)]),
    );
    expect(finished).toEqual({ status: 200, body: { ok: true, match: 'match-left', received: 3 } });

    expect(await departuresOf('match-left')).toEqual([ids.bob, ids.bob]);
    const rows = await rowsOf('match-left');
    // The final scoreboard keeps its players present at the end; bob's line stands apart, a defeat.
    expect(rows.filter((row) => row.name === 'alice' || row.name === 'bob')).toEqual([
      {
        name: 'alice',
        team: 0,
        winner: 0,
        score: 200,
        left_early: 0,
        expected_players: 3,
        verification: 'single',
        forfeit: null,
      },
      {
        name: 'bob',
        team: 0,
        winner: 1,
        score: 1200,
        left_early: 1,
        expected_players: 3,
        verification: 'confirmed',
        forfeit: null,
      },
    ]);
    expect(await owed('match-left')).toEqual({ alice: 0, bob: 5, carla: 0 });
  });

  test('the score keeps the goals of an opponent who left, as the game counted them', async () => {
    // Opponent 2 scored Orange's goal, then left: neither the scoreboard nor the club's departures keep his line.
    const present = [line('alice'), line('bob'), line('Opponent 1')];
    expect((await send('alice', ended('opponent-left', present, [line('Opponent 2')]))).status).toBe(200);
    expect(await departuresOf('opponent-left')).toEqual([]);
    const rows = (await readStoredResults(env.DB)).filter((row) => row.match_guid === 'opponent-left');
    expect(rows.map((row) => [row.name, row.blue_goals, row.orange_goals])).toEqual(
      expect.arrayContaining([
        ['Opponent 1', 2, 1],
        ['alice', 2, 1],
        ['bob', 2, 1],
      ]),
    );
    expect(rows.length).toBe(3);
  });

  test('every line of a match keeps the playlist it was played in', async () => {
    const everyone = [line('alice'), line('bob'), line('Opponent 1'), line('Opponent 2')];
    expect((await send('alice', ended('ranked-doubles', everyone))).status).toBe(200);
    const rows = (await readStoredResults(env.DB)).filter((row) => row.match_guid === 'ranked-doubles');
    expect(rows.map((row) => row.playlist)).toEqual([11, 11, 11, 11]);
  });

  test('a private match lost, even one a player left, costs the pushups of any match', async () => {
    const lost = (guid: string, playlist: number) => {
      const match = ended(guid, [line('alice'), line('Opponent 1'), line('Opponent 2')], [line('bob')]);
      match.state.Game = { ...match.state.Game, PlaylistId: playlist, Winner: 'Orange', Teams: [...teams].reverse() };
      match.end.WinnerTeamNum = 1;
      return match;
    };
    expect((await send('alice', lost('private-loss', 6))).status).toBe(200);
    expect((await send('alice', lost('ranked-loss', rankedDoublesPlaylist))).status).toBe(200);
    const rows = (await readStoredResults(env.DB)).filter((row) => row.match_guid === 'private-loss');
    expect(rows.map((row) => row.playlist)).toEqual(Array(rows.length).fill(6));
    expect(await owed('private-loss')).toEqual(await owed('ranked-loss'));
    expect((await owed('private-loss')).alice).toBe(5);
  });

  test('a departure counts for nothing once a final line of that player arrives, from any source', async () => {
    const everyone = [line('alice'), line('bob'), line('Opponent 1'), line('Opponent 2')];
    expect((await send('bob', left('came-back', everyone))).status).toBe(200);
    expect(await owed('came-back')).toEqual({ alice: 0, bob: 5, carla: 0 });
    // He came back before the end: alice's scoreboard has him.
    expect((await send('alice', ended('came-back', everyone))).status).toBe(200);
    expect((await rowsOf('came-back')).find((row) => row.name === 'bob')).toMatchObject({ winner: 0, left_early: 0 });
    expect(await owed('came-back')).toEqual({ alice: 0, bob: 0, carla: 0 });
  });

  test('a match left after its final result changes nothing', async () => {
    const everyone = [line('alice'), line('bob'), line('Opponent 1'), line('Opponent 2')];
    expect((await send('alice', ended('already-over', everyone))).status).toBe(200);
    const before = await rowsOf('already-over');
    expect(await send('alice', left('already-over', everyone))).toEqual({
      status: 200,
      body: { ok: true, match: 'already-over', received: 1 },
    });
    expect(await rowsOf('already-over')).toEqual(before);
  });

  test('a match left records its sender alone, and needs his own player', async () => {
    const everyone = [line('alice'), line('bob'), line('Opponent 1'), line('Opponent 2')];
    expect((await send('alice', left('alice-left', everyone))).status).toBe(200);
    expect(await departuresOf('alice-left')).toEqual([ids.alice]);
    expect((await rowsOf('alice-left')).map((row) => row.name)).toEqual(['alice']);

    const withoutAlice = await send('alice', left('not-hers', [line('bob'), line('Opponent 1')]));
    expect(withoutAlice.status).toBe(403);
    expect(await departuresOf('not-hers')).toEqual([]);
  });

  test('opponents all gone before the end make a forfeit; gone after it, they make none', async () => {
    const club = [line('alice'), line('bob')];
    const opponents = [line('Opponent 1'), line('Opponent 2')];
    expect((await send('alice', ended('opponents-gone', club, opponents))).status).toBe(200);
    // Losers who quit during the podium are on no departure list.
    expect((await send('alice', ended('podium-quit', club))).status).toBe(200);
    // One opponent left before the end, the other stayed to the end, then quit during the podium.
    expect((await send('alice', ended('one-stayed', club, opponents.slice(0, 1)))).status).toBe(200);

    const forfeits = await env.DB.prepare(
      `SELECT match_guid, forfeit, COUNT(*) AS players FROM match_results GROUP BY match_guid, forfeit ORDER BY match_guid`,
    ).all();
    expect(forfeits.results).toEqual([
      { match_guid: 'one-stayed', forfeit: null, players: 2 },
      { match_guid: 'opponents-gone', forfeit: 1, players: 2 },
      { match_guid: 'podium-quit', forfeit: null, players: 2 },
    ]);
    // Nobody else's departure is kept: only the club's players count.
    expect(await departuresOf('opponents-gone')).toEqual([]);
    expect(await owed('opponents-gone')).toEqual({ alice: -5, bob: -5, carla: 0 });
  });

  test('an unreadable departure list is dropped, and the match still counts', async () => {
    const body = { ...ended('unreadable', [line('alice'), line('Opponent 1')]), departures: [{ PrimaryId: 'nobody' }] };
    expect((await send('alice', body)).status).toBe(200);
    expect(await departuresOf('unreadable')).toEqual([]);
    expect((await rowsOf('unreadable')).map((row) => row.name)).toEqual(['Opponent 1', 'alice']);
  });
});
