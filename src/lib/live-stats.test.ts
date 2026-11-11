import { env } from 'cloudflare:workers';
import { describe, expect, test } from 'vitest';
import { roster } from './club-fixture';
import { summarize } from './domain';
import { liveBridge } from './live-bridge';
import { matchCapture, parseLiveMatch, statsStream } from './live-stats';
import { endingOf } from './match-rules';
import { attributeLivePlayers, readIdentityBindings } from './player-identities';
import { observationWrites, readMerged } from './reconcile';

const [first = '', second = '', third = ''] = roster;
const account = 'b'.repeat(32);
const now = Date.now();

interface LivePlayer {
  Name: string;
  PrimaryId: string;
  TeamNum: number;
  Score: number;
  Goals: number;
  Assists: number;
  Saves: number;
}

interface LivePayload {
  startedAt: number;
  endedAt: number;
  seenIds: string[];
  end: { MatchGuid: string; WinnerTeamNum: number };
  state: {
    MatchGuid: string;
    Players: LivePlayer[];
    Game: {
      PlaylistId: number;
      Teams: { Name: string; TeamNum: number; Score: number }[];
      bHasWinner: boolean;
      bReplay: boolean;
      Winner: string;
      TimeSeconds?: unknown;
      bOvertime?: unknown;
    };
  };
  clockTrace?: unknown;
  departures?: unknown;
  left?: boolean;
}

function payload(guid = 'synthetic-live-match'): LivePayload {
  const identities: [string, string][] = [
    ['renamed-player', `Epic|${account}|0`],
    [second, `Epic|${'c'.repeat(32)}|0`],
    [third, 'PS4|222222|0'],
    ['Opponent 1', `Epic|${'d'.repeat(32)}|0`],
    ['Opponent 2', `Epic|${'e'.repeat(32)}|0`],
    ['Opponent 3', `Epic|${'f'.repeat(32)}|0`],
  ];
  const players = identities.map(([Name, PrimaryId], i) => ({
    Name,
    PrimaryId,
    TeamNum: i < 3 ? 0 : 1,
    Score: 100 + i * 10,
    Goals: 0,
    Assists: 0,
    Saves: 1,
  }));
  return {
    startedAt: now - 360000,
    endedAt: now - 1000,
    seenIds: players.map((p) => p.PrimaryId),
    end: { MatchGuid: guid, WinnerTeamNum: 1 },
    state: {
      MatchGuid: guid,
      Players: players,
      Game: {
        PlaylistId: 13,
        Teams: [
          { Name: 'Blue', TeamNum: 0, Score: 1 },
          { Name: 'Orange', TeamNum: 1, Score: 2 },
        ],
        bHasWinner: true,
        bReplay: false,
        Winner: 'Orange',
      },
    },
  };
}

const packet = (Event: string, Data: unknown) => ({ Event, Data });

function finish(capture: ReturnType<typeof matchCapture>, p: LivePayload) {
  capture.handle(packet('MatchEnded', p.end));
  capture.handle(packet('UpdateState', p.state));
  capture.handle(packet('UpdateState', p.state));
}

describe('live stats', () => {
  test('official stream: concatenated objects, fragmented frames, JSON-encoded Data and escaped braces', () => {
    const frames = [
      packet('UpdateState', { MatchGuid: 'synthetic', Name: 'Nom "{ }" \\ é' }),
      packet('MatchEnded', JSON.stringify({ MatchGuid: 'synthetic', WinnerTeamNum: 1 })),
    ];
    const text = frames.map((frame) => JSON.stringify(frame)).join('\n');
    const stream = statsStream();
    const out: unknown[] = [];
    for (let i = 0; i < text.length; i += 7) out.push(...stream.push(text.slice(i, i + 7)));
    expect(out).toEqual([frames[0], { ...frames[1], Data: JSON.parse(String(frames[1]?.Data)) }]);
    expect(stream.push('  ')).toEqual([]);
    expect(() => stream.push('x')).toThrow();
    expect(() => stream.push('x'.repeat(262145))).toThrow();
    expect(stream.push(JSON.stringify(frames[0]))).toEqual([frames[0]]);
  });

  test('capture waits for two consistent final scoreboards, never the last tick before the end', () => {
    const received: LivePayload[] = [];
    const p = payload();
    const capture = matchCapture(
      (completed) => received.push(completed as LivePayload),
      () => now,
    );
    capture.handle(packet('MatchCreated', { MatchGuid: p.state.MatchGuid }));
    capture.handle(packet('MatchInitialized', { MatchGuid: p.state.MatchGuid }));
    const pre = structuredClone(p.state);
    pre.Game.bHasWinner = false;
    pre.Game.Winner = '';
    pre.Game.bReplay = true;
    capture.handle(packet('UpdateState', pre));
    capture.handle(packet('MatchEnded', p.end));
    capture.handle(packet('UpdateState', pre));
    expect(received.length).toBe(0);
    capture.handle(packet('UpdateState', p.state));
    expect(received.length).toBe(0);
    const final = structuredClone(p.state);
    const firstPlayer = final.Players[0];
    if (firstPlayer) firstPlayer.Score = 250;
    capture.handle(packet('UpdateState', final));
    expect(received.length).toBe(0);
    capture.handle(packet('UpdateState', final));
    expect(received.length).toBe(1);
    expect(parseLiveMatch(roster, received[0], now).rows[0]?.score).toBe(250);
    finish(capture, p);
    expect(received.length).toBe(1);
  });

  test('a historical replay, a mid-match connection or a vanished scoreboard is never imported', () => {
    for (const mode of ['replay', 'mid-match', 'destroyed']) {
      const out: LivePayload[] = [];
      const p = payload(mode);
      const capture = matchCapture(
        (completed) => out.push(completed as LivePayload),
        () => now,
      );
      if (mode === 'replay') capture.handle(packet('ReplayCreated', { MatchGuid: mode }));
      if (mode !== 'mid-match') capture.handle(packet('MatchCreated', { MatchGuid: mode }));
      capture.handle(packet('UpdateState', p.state));
      if (mode === 'destroyed') capture.handle(packet('MatchDestroyed', { MatchGuid: mode }));
      finish(capture, p);
      // A match destroyed before its end was left: it sends no result, only its sender's departure.
      expect(
        out.map((sent) => sent.left === true),
        mode,
      ).toEqual(mode === 'destroyed' ? [true] : []);
    }
  });

  test('a forfeit counts: players who left, bots and a late or missing winner flag are not required', () => {
    const left = payload();
    left.state.Players.splice(3, 2);
    left.seenIds.pop();
    left.state.Game.bHasWinner = false;
    left.state.Game.Winner = '';
    expect(parseLiveMatch(roster, left, now).rows.length).toBe(4);
    expect(parseLiveMatch(roster, left, now).rosters).toEqual([
      { matchGuid: 'synthetic-live-match', playerCount: 4, blueGoals: 1, orangeGoals: 2 },
    ]);
    const bot = payload();
    const opponent = bot.state.Players[5];
    if (!opponent) throw new Error('missing synthetic opponent');
    opponent.PrimaryId = 'Unknown|0|0';
    expect(parseLiveMatch(roster, bot, now).rows.length).toBe(5);
    const alone = payload();
    alone.state.Players.splice(3, 3);
    expect(parseLiveMatch(roster, alone, now).rows.map((row) => row.team)).toEqual([0, 0, 0]);
  });

  test('a match left right after its end is sent with the latest scoreboard', () => {
    const out: LivePayload[] = [];
    const p = payload('forfeit');
    p.state.Players.splice(4, 2);
    const capture = matchCapture(
      (completed) => out.push(completed as LivePayload),
      () => now,
    );
    capture.handle(packet('MatchCreated', { MatchGuid: 'forfeit' }));
    capture.handle(packet('UpdateState', p.state));
    capture.handle(packet('MatchEnded', p.end));
    capture.handle(packet('MatchDestroyed', { MatchGuid: 'forfeit' }));
    expect(out.length).toBe(1);
    expect(out[0]?.state.Players.length).toBe(4);
    const left = matchCapture(
      (completed) => out.push(completed as LivePayload),
      () => now,
    );
    left.handle(packet('MatchCreated', { MatchGuid: 'quit' }));
    left.handle(packet('UpdateState', payload('quit').state));
    left.handle(packet('MatchDestroyed', { MatchGuid: 'quit' }));
    // Left before the end: no scoreboard, its sender's departure.
    expect(out.length).toBe(2);
    expect(out[1]?.left).toBe(true);
    expect(out[1]?.end).toBeUndefined();
  });

  test('validation: no forfeit inferred from the score, no bots, private, unknown winner, duplicate or partial snapshot', () => {
    const forfeited = payload();
    const blue = forfeited.state.Game.Teams[0];
    if (blue) blue.Score = 5;
    expect(parseLiveMatch(roster, forfeited, now).rows.length).toBe(6);
    const player = (p: LivePayload, index: number) => {
      const found = p.state.Players[index];
      if (!found) throw new Error('missing synthetic player');
      return found;
    };
    const mutations: ((p: LivePayload) => void)[] = [
      (p) => {
        p.end.WinnerTeamNum = 2;
      },
      (p) => {
        p.end.MatchGuid = 'other';
      },
      (p) => {
        p.state.Game.bReplay = true;
      },
      (p) => {
        p.state.Game.Winner = 'Blue';
      },
      (p) => {
        p.state.Game.PlaylistId = 6;
      },
      (p) => {
        p.state.Game.PlaylistId = 40;
      },
      (p) => {
        player(p, 1).PrimaryId = player(p, 0).PrimaryId;
      },
      (p) => {
        for (const found of p.state.Players) found.PrimaryId = 'Bot|1|0';
      },
      (p) => {
        player(p, 0).Score = Number.NaN;
      },
      (p) => {
        p.endedAt = now + 60000;
      },
      (p) => {
        p.startedAt = now + 1;
      },
    ];
    for (const mutate of mutations) {
      const p = payload();
      mutate(p);
      expect(() => parseLiveMatch(roster, p, now)).toThrow();
    }
  });

  test('the clock at the end tells a forfeit or an overtime, and nothing from an older collector', () => {
    const ending = (clock: { TimeSeconds?: unknown; bOvertime?: unknown }) => {
      const p = payload();
      Object.assign(p.state.Game, clock);
      const [received] = parseLiveMatch(roster, p, now).rosters;
      if (!received) throw new Error('missing scoreboard');
      return endingOf(received);
    };
    expect(ending({ TimeSeconds: 143, bOvertime: false })).toEqual({ forfeit: true, overtime: false });
    expect(ending({ TimeSeconds: 0, bOvertime: false })).toEqual({ forfeit: false, overtime: false });
    expect(ending({ TimeSeconds: 37, bOvertime: true })).toEqual({ forfeit: false, overtime: true });
    expect(ending({})).toEqual({ forfeit: null, overtime: null });
    // An unreadable clock is unknown, and the match still counts.
    expect(ending({ TimeSeconds: -1, bOvertime: 'no' })).toEqual({ forfeit: null, overtime: null });
    expect(ending({ TimeSeconds: '143', bOvertime: false })).toEqual({ forfeit: null, overtime: false });
  });

  test('capture sends the clock of the last update before the end, lowered only from its last second', () => {
    const sent = (before: number, after: { TimeSeconds: number; bOvertime: boolean }) => {
      const out: LivePayload[] = [];
      const p = payload('clock');
      const capture = matchCapture(
        (completed) => out.push(completed as LivePayload),
        () => now,
      );
      capture.handle(packet('MatchCreated', { MatchGuid: 'clock' }));
      capture.handle(
        packet('UpdateState', { ...p.state, Game: { ...p.state.Game, TimeSeconds: before, bOvertime: false } }),
      );
      capture.handle(packet('MatchEnded', p.end));
      const final = { ...p.state, Game: { ...p.state.Game, ...after } };
      capture.handle(packet('UpdateState', final));
      capture.handle(packet('UpdateState', final));
      expect(out.length).toBe(1);
      return [out[0]?.state.Game.TimeSeconds, out[0]?.state.Game.bOvertime];
    };
    expect(sent(143, { TimeSeconds: 300, bOvertime: false })).toEqual([143, false]);
    // A forfeit: the game may set the clock to 0:00 after the end, the time left before it stays.
    expect(sent(143, { TimeSeconds: 0, bOvertime: true })).toEqual([143, false]);
    // The tick that reached 0:00 after MatchEnded: a full match, not a forfeit.
    expect(sent(1, { TimeSeconds: 0, bOvertime: false })).toEqual([0, false]);
  });

  test('capture sends the last changes of the clock before the end and the first ones after it', () => {
    const out: LivePayload[] = [];
    const p = payload('trace');
    const capture = matchCapture(
      (completed) => out.push(completed as LivePayload),
      () => now,
    );
    const update = (TimeSeconds: number) =>
      capture.handle(packet('UpdateState', { ...p.state, Game: { ...p.state.Game, TimeSeconds, bOvertime: false } }));
    capture.handle(packet('MatchCreated', { MatchGuid: 'trace' }));
    for (let time = 150; time >= 140; time--) update(time);
    update(140);
    capture.handle(packet('MatchEnded', p.end));
    update(0);
    update(0);
    expect(out[0]?.clockTrace).toEqual([
      ...[145, 144, 143, 142, 141, 140].map((TimeSeconds) => ({ TimeSeconds, bOvertime: false, ended: false })),
      { TimeSeconds: 0, bOvertime: false, ended: true },
    ]);
    expect(out[0]?.state.Game.TimeSeconds).toBe(140);
    const [received] = parseLiveMatch(roster, out[0], now).rosters;
    expect(JSON.parse(received?.clockTrace ?? 'null')).toEqual(out[0]?.clockTrace);
    // An unreadable trace is dropped, and the match still counts.
    const unreadable = { ...out[0], clockTrace: [{ TimeSeconds: 'soon', ended: true }] };
    expect(parseLiveMatch(roster, unreadable, now).rosters[0]?.clockTrace).toBeUndefined();
  });

  test('departures: a player gone before the end loses with his last line; an unreadable list is dropped', () => {
    const p = payload('departed');
    const [gone] = p.state.Players.splice(1, 1);
    if (!gone) throw new Error('missing synthetic player');
    const parsed = parseLiveMatch(roster, { ...p, departures: [gone] }, now);
    expect(parsed.rows.length).toBe(5);
    // The teams' score, as the game counted it, keeps the goals of the player who left.
    expect(parsed.rosters).toEqual([{ matchGuid: 'departed', playerCount: 5, blueGoals: 1, orangeGoals: 2 }]);
    expect(parsed.departures).toEqual([
      expect.objectContaining({ matchGuid: 'departed', name: second, team: 0, winner: 1, score: 110, kind: 'match' }),
    ]);
    // Back on the final scoreboard: he did not leave.
    expect(parseLiveMatch(roster, { ...p, departures: [gone, p.state.Players[0]] }, now).departures.length).toBe(1);
    // An older collector sends none; an unreadable list or one over 8 players is dropped, and the match counts.
    for (const departures of [undefined, [{ ...gone, Score: 'lots' }], [{ ...gone, PrimaryId: 'Unknown|0|0' }], 'x']) {
      const kept = parseLiveMatch(roster, { ...p, departures }, now);
      expect(kept.rows.length).toBe(5);
      expect(kept.departures).toEqual([]);
    }
    expect(parseLiveMatch(roster, { ...p, departures: Array(9).fill(gone) }, now).departures).toEqual([]);
  });

  test('opponents all gone before the end are a forfeit; gone after it, or one unplaced, they are not', () => {
    const p = payload('gone');
    p.end.WinnerTeamNum = 0;
    p.state.Game.Winner = 'Blue';
    const opponents = p.state.Players.splice(3, 3);
    const gone = (departures?: LivePlayer[]) =>
      parseLiveMatch(roster, { ...p, departures }, now).rosters[0]?.opponentsGone ?? false;
    expect(gone(opponents)).toBe(true);
    // Losers quit during the podium: on no departure list.
    expect(gone()).toBe(false);
    // One of them stayed to the end: seen, and neither on the scoreboard nor among the departures.
    expect(gone(opponents.slice(0, 2))).toBe(false);
    // A club player who left is no opponent.
    expect(gone([...(p.state.Players.splice(2, 1) as LivePlayer[]), ...opponents])).toBe(true);
  });

  test('a match left: its last scoreboard, every line a defeat, checked like a final one', () => {
    const p = payload('left-match');
    const left = {
      left: true,
      state: {
        MatchGuid: 'left-match',
        Players: p.state.Players,
        Game: { PlaylistId: 13, Teams: p.state.Game.Teams, bReplay: false },
      },
      startedAt: now - 120_000,
      leftAt: now - 1000,
      seenIds: p.seenIds,
    };
    const parsed = parseLiveMatch(roster, left, now);
    expect(parsed.rosters).toEqual([]);
    expect(parsed.departures.map((row) => [row.name, row.team, row.winner])).toEqual([
      ['renamed-player', 0, 1],
      [second, 0, 1],
      [third, 0, 1],
      ['Opponent 1', 1, 0],
      ['Opponent 2', 1, 0],
      ['Opponent 3', 1, 0],
    ]);
    const refused: Record<string, unknown>[] = [
      { ...left, state: { ...left.state, Game: { ...left.state.Game, bReplay: true } } },
      { ...left, state: { ...left.state, Game: { ...left.state.Game, PlaylistId: 6 } } },
      { ...left, state: { ...left.state, Players: [] } },
      { ...left, leftAt: undefined },
      { ...left, leftAt: left.startedAt - 1 },
      { ...left, state: { ...left.state, MatchGuid: ' ' } },
    ];
    for (const body of refused) expect(() => parseLiveMatch(roster, body, now)).toThrow();
  });

  test("capture counts each shot of a player on the frame of the opponents' goal, and sends the demolitions", () => {
    const out: LivePayload[] = [];
    const p = payload('crossbars');
    const capture = matchCapture(
      (completed) => out.push(completed as LivePayload),
      () => now,
    );
    // The game names a player by a shortcut in his team in its events, and in the scoreboard.
    const state = structuredClone(p.state);
    for (const [index, player] of state.Players.entries()) Object.assign(player, { Shortcut: index % 3, Demos: index });
    // Blue (0) attacks the goal at positive Y, orange (1) the one at negative Y.
    const hit = (Shortcut: number, TeamNum: number, Y: number) =>
      packet('CrossbarHit', {
        MatchGuid: 'crossbars',
        BallLocation: { X: 800, Y, Z: 640 },
        BallLastTouch: { Player: { Name: 'x', Shortcut, TeamNum } },
      });
    const event = (name: string) => packet(name, { MatchGuid: 'crossbars' });
    capture.handle(event('MatchCreated'));
    capture.handle(packet('UpdateState', state));
    capture.handle(hit(1, 0, 5100));
    // The ball bounces bar then post: still the same shot.
    capture.handle(hit(1, 0, 5100));
    capture.handle(event('BallHit'));
    // The frame of his own goal.
    capture.handle(hit(1, 0, -5100));
    capture.handle(event('BallHit'));
    capture.handle(hit(1, 0, 5100));
    capture.handle(event('BallHit'));
    capture.handle(hit(2, 1, -5100));
    capture.handle(event('BallHit'));
    // Nobody the scoreboard names: no one to count it for.
    capture.handle(hit(7, 0, 5100));
    // The goal replay plays the hits again, touches included.
    capture.handle(event('GoalScored'));
    capture.handle(event('BallHit'));
    capture.handle(hit(1, 0, 5100));
    capture.handle(event('CountdownBegin'));
    capture.handle(event('RoundStarted'));
    capture.handle(hit(2, 1, -5100));
    capture.handle(packet('MatchEnded', p.end));
    // After the end, a hit counts for nobody.
    capture.handle(event('BallHit'));
    capture.handle(hit(0, 0, 5100));
    capture.handle(packet('UpdateState', state));
    capture.handle(packet('UpdateState', state));
    expect(out.length).toBe(1);
    const rows = parseLiveMatch(roster, out[0], now).rows;
    expect(rows.map((row) => [row.name, row.demos, row.crossbarHits])).toEqual([
      ['renamed-player', 0, 0],
      [second, 1, 2],
      [third, 2, 0],
      ['Opponent 1', 3, 0],
      ['Opponent 2', 4, 0],
      ['Opponent 3', 5, 2],
    ]);
  });

  test('a scoreboard without demolitions nor crossbar hits, or with unreadable ones, still counts without them', () => {
    const older = payload('older');
    expect(parseLiveMatch(roster, older, now).rows.every((row) => !('demos' in row) && !('crossbarHits' in row))).toBe(
      true,
    );
    const unreadable = payload('unreadable');
    for (const player of unreadable.state.Players) Object.assign(player, { Demos: -1, CrossbarHits: 'a lot' });
    const rows = parseLiveMatch(roster, unreadable, now).rows;
    expect(rows.length).toBe(6);
    expect(rows.some((row) => 'demos' in row || 'crossbarHits' in row)).toBe(false);
  });

  /** The capture counts the crossbar hits of every player it sends: none in these matches. */
  const unhit = (players: LivePlayer[]) => players.map((player) => ({ ...player, CrossbarHits: 0 }));

  test('capture sends the players gone before the end, first seen first, with their last line before it', () => {
    const out: LivePayload[] = [];
    const p = payload('departures');
    const capture = matchCapture(
      (completed) => out.push(completed as LivePayload),
      () => now,
    );
    const without = (...names: string[]) => ({
      ...p.state,
      Players: p.state.Players.filter((player) => !names.includes(player.Name)),
    });
    capture.handle(packet('MatchCreated', { MatchGuid: 'departures' }));
    capture.handle(packet('UpdateState', p.state));
    const scored = structuredClone(p.state);
    for (const player of scored.Players) player.Score += 50;
    capture.handle(packet('UpdateState', scored));
    // A goal replay holds nobody's departure.
    capture.handle(packet('UpdateState', { ...without(third), Game: { ...p.state.Game, bReplay: true } }));
    capture.handle(packet('UpdateState', without(second, 'Opponent 3')));
    capture.handle(packet('MatchEnded', p.end));
    // Opponent 2 quits during the podium: after the end, no departure.
    const podium = without(second, 'Opponent 2', 'Opponent 3');
    capture.handle(packet('UpdateState', podium));
    capture.handle(packet('UpdateState', podium));
    expect(out.length).toBe(1);
    const lineOf = (index: number) => {
      const { Name, PrimaryId, TeamNum, Score, Goals, Assists, Saves } = scored.Players[index] as LivePlayer;
      return { PrimaryId, Name, TeamNum, Score, Goals, Assists, Saves, CrossbarHits: 0 };
    };
    // The same JSON as the collector's, in its order.
    expect(JSON.stringify(out[0])).toBe(
      JSON.stringify({
        state: { ...podium, Players: unhit(podium.Players) },
        end: p.end,
        startedAt: now,
        endedAt: now,
        seenIds: p.seenIds,
        departures: [lineOf(1), lineOf(5)],
      }),
    );
    expect(parseLiveMatch(roster, out[0], now).departures.map((row) => [row.name, row.score])).toEqual([
      [second, 160],
      ['Opponent 3', 200],
    ]);
  });

  test('capture sends a match left before its end as left, its last usable scoreboard; a closed stream sends nothing', () => {
    const out: LivePayload[] = [];
    const p = payload('quit');
    const capture = matchCapture(
      (completed) => out.push(completed as LivePayload),
      () => now,
    );
    capture.handle(packet('MatchCreated', { MatchGuid: 'quit' }));
    capture.handle(packet('UpdateState', p.state));
    capture.handle(packet('UpdateState', { ...p.state, Players: [], Game: { ...p.state.Game, bReplay: false } }));
    capture.handle(packet('MatchInitialized', { MatchGuid: 'next' }));
    expect(JSON.stringify(out)).toBe(
      JSON.stringify([
        {
          left: true,
          state: {
            MatchGuid: 'quit',
            Players: unhit(p.state.Players),
            Game: { PlaylistId: 13, Teams: p.state.Game.Teams, bReplay: false },
          },
          startedAt: now,
          leftAt: now,
          seenIds: p.seenIds,
        },
      ]),
    );
    expect(parseLiveMatch(roster, out[0], now).departures.length).toBe(6);
    capture.handle(packet('UpdateState', payload('next').state));
    capture.reset();
    capture.handle(packet('MatchDestroyed', { MatchGuid: 'next' }));
    expect(out.length).toBe(1);
  });

  test('Paris midnight: the live day uses the match start, like the Epic history', () => {
    const p = payload();
    p.startedAt = Date.parse('2026-11-05T22:58:00Z');
    p.endedAt = Date.parse('2026-11-05T23:05:00Z');
    expect(parseLiveMatch(roster, p, p.endedAt).rows[0]?.day).toBe('2026-11-05');
  });
});

async function linkIdentities() {
  await env.DB.batch(
    [
      'player_identities',
      'player_identity_aliases',
      'result_observations',
      'source_reports',
      'prototype_results',
      'prototype_match_rosters',
    ].map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
  );
  const identities: [string, string, string][] = [
    [first, 'current-user', `Epic|${account}|0`],
    [second, 'friend-one', `Epic|${'c'.repeat(32)}|0`],
    [third, 'friend-two', 'PS4|222222|0'],
  ];
  for (const [slot, owner, id] of identities) {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO player_identities (slot,owner,player_id) VALUES (?,?,?)').bind(slot, owner, id),
      env.DB.prepare('INSERT INTO player_identity_aliases VALUES (?,?,?,?)').bind(id, slot, owner, 'synthetic'),
    ]);
  }
}

// What the live route does with an accepted payload, without its session and origin checks.
async function receive(body: string): Promise<Response> {
  try {
    const parsed = parseLiveMatch(roster, JSON.parse(body));
    const rows = attributeLivePlayers(roster, parsed.rows, await readIdentityBindings(env.DB, roster));
    const writes = await observationWrites(
      env.DB,
      { rows, rosters: parsed.rosters, sourceId: 'live-synthetic', sourceType: 'collector' },
      new Date().toISOString(),
    );
    await env.DB.batch(writes as D1PreparedStatement[]);
    return Response.json({ ok: true, match: rows[0]?.matchGuid, received: rows.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Envoi invalide.' }, { status: 400 });
  }
}

async function observationCount() {
  return (await env.DB.prepare('SELECT COUNT(*) AS n FROM result_observations').first<{ n: number }>())?.n;
}

async function mergedStats() {
  const merged = await readMerged(env.DB, roster);
  return { merged, stats: summarize(roster, merged.rows, [], '', merged.rosters) };
}

describe('live reception', () => {
  test('a received match is attributed to linked identities, and an Epic confirmation adds no duplicate', async () => {
    await linkIdentities();
    const p = payload();
    for (let i = 0; i < 2; i++) {
      const response = await receive(JSON.stringify(p));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true });
    }
    let { merged, stats } = await mergedStats();
    expect(stats.map((s) => s.played)).toEqual([1, 1, 1]);
    // A defeat: 5 each, and 5 more for the club player with the fewest points of the team.
    expect(stats.map((s) => s.remaining)).toEqual([10, 5, 5]);
    expect(merged.rosters.length).toBe(1);
    expect(await observationCount()).toBe(6);

    const parsed = parseLiveMatch(roster, p);
    const renamed = parsed.rows.map((row, i) => ({ ...row, name: i === 0 ? first : row.name, winner: 0 }));
    const writes = await observationWrites(
      env.DB,
      { rows: renamed, rosters: parsed.rosters, sourceType: 'epic', sourceId: first },
      new Date().toISOString(),
    );
    await env.DB.batch(writes as D1PreparedStatement[]);
    ({ merged, stats } = await mergedStats());
    expect(stats.map((s) => s.played)).toEqual([1, 1, 1]);
    expect(stats.map((s) => s.wins)).toEqual([1, 1, 1]);
    expect(stats.map((s) => s.remaining)).toEqual([0, 0, 0]);
    expect(merged.rosters.length).toBe(1);
  });

  test('a real tab survives a failure after saving: the local queue resumes without losing or doubling the match', async () => {
    await linkIdentities();
    const storage = new Map<string, string>();
    const timers = new Map<number, { fn: () => void; delay: number }>();
    const sockets: FakeSocket[] = [];
    const statuses: Record<string, unknown>[] = [];
    let nextTimer = 0;
    let fail = true;
    let posts = 0;
    let markFailure = () => {};
    let markReceived = () => {};
    const failed = new Promise<void>((resolve) => {
      markFailure = resolve;
    });
    const received = new Promise<void>((resolve) => {
      markReceived = resolve;
    });

    class FakeSocket {
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      constructor(url: string) {
        expect(url).toBe('ws://localhost:49124/');
        sockets.push(this);
      }
      close() {}
      emit(message: unknown) {
        this.onmessage?.({ data: JSON.stringify(message) });
      }
    }

    type Options = NonNullable<Parameters<typeof liveBridge>[0]>;
    const config = {
      WebSocketType: FakeSocket as unknown as Options['WebSocketType'],
      storage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      } as unknown as Options['storage'],
      schedule: ((fn: () => void, delay: number) => {
        timers.set(++nextTimer, { fn, delay });
        return nextTimer;
      }) as unknown as Options['schedule'],
      cancel: ((id: number) => {
        timers.delete(id);
      }) as unknown as Options['cancel'],
      now: () => now,
      onStatus: (patch: Record<string, unknown>) => {
        statuses.push(patch);
        if (patch.message === 'Envoi en attente de connexion Internet.') markFailure();
        if (patch.lastReceived) markReceived();
      },
      fetcher: (async (url: string, options: RequestInit) => {
        expect(url).toBe('/api/live');
        expect(new Headers(options.headers).get('Authorization')).toBe(null);
        posts++;
        const response = await receive(String(options.body));
        if (fail) {
          fail = false;
          throw new Error('Synthetic connection lost after commit');
        }
        return response;
      }) as unknown as Options['fetcher'],
    } as Options;

    const queued = () => JSON.parse(storage.get('rl-live-queue-v1') ?? '[]') as unknown[];
    let bridge = liveBridge(config);
    try {
      bridge.start();
      const socket = sockets[0];
      if (!socket) throw new Error('expected a socket');
      socket.onopen?.();
      const p = payload();
      socket.emit(packet('MatchCreated', { MatchGuid: p.state.MatchGuid }));
      for (const message of [
        packet('UpdateState', p.state),
        packet('MatchEnded', p.end),
        packet('UpdateState', p.state),
        packet('UpdateState', p.state),
      ]) {
        socket.emit(message);
      }
      await failed;
      expect(posts).toBe(1);
      expect(await observationCount()).toBe(6);
      expect(queued().length).toBe(1);

      bridge.stop();
      expect(timers.size).toBe(0);
      bridge = liveBridge(config);
      bridge.start();
      await received;
      expect(posts).toBe(2);
      expect(queued().length).toBe(0);
      expect(await observationCount()).toBe(6);
      expect(statuses.some((s) => s.lastReceived === now)).toBe(true);
      const { stats } = await mergedStats();
      expect(stats.map((s) => s.played)).toEqual([1, 1, 1]);
    } finally {
      bridge.stop();
    }
  });
});
