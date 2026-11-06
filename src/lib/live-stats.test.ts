import { env } from 'cloudflare:workers';
import { describe, expect, test } from 'vitest';
import { roster } from './club-fixture';
import { summarize } from './domain';
import { liveBridge } from './live-bridge';
import { matchCapture, parseLiveMatch, statsStream } from './live-stats';
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
    };
  };
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
      const out: unknown[] = [];
      const p = payload(mode);
      const capture = matchCapture(
        (completed) => out.push(completed),
        () => now,
      );
      if (mode === 'replay') capture.handle(packet('ReplayCreated', { MatchGuid: mode }));
      if (mode !== 'mid-match') capture.handle(packet('MatchCreated', { MatchGuid: mode }));
      capture.handle(packet('UpdateState', p.state));
      if (mode === 'destroyed') capture.handle(packet('MatchDestroyed', { MatchGuid: mode }));
      finish(capture, p);
      expect(out.length, mode).toBe(0);
    }
  });

  test('a forfeit counts: players who left, bots and a late or missing winner flag are not required', () => {
    const left = payload();
    left.state.Players.splice(3, 2);
    left.seenIds.pop();
    left.state.Game.bHasWinner = false;
    left.state.Game.Winner = '';
    expect(parseLiveMatch(roster, left, now).rows.length).toBe(4);
    expect(parseLiveMatch(roster, left, now).rosters).toEqual([{ matchGuid: 'synthetic-live-match', playerCount: 4 }]);
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
    expect(out.length).toBe(1);
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
