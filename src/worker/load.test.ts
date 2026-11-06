import { env } from 'cloudflare:workers';
import { expect, test } from 'vitest';
import { prepareBoard } from '../lib/board';
import { joinTestClub } from '../lib/club-fixture';
import { observationWrites } from '../lib/reconcile';
import { app } from './app';
import { sha256 } from './auth';

// The free plan allows 5 million rows read per day: what each request reads must not grow with the history.
// `npx vitest run src/worker/load.test.ts --silent=false` prints the measures (LOAD, as JSON).

interface Usage {
  queries: number;
  rowsRead: number;
  rowsWritten: number;
}

function counting(db: D1Database): { db: D1Database; usage: Usage } {
  const usage: Usage = { queries: 0, rowsRead: 0, rowsWritten: 0 };
  const record = (meta: D1Meta) => {
    usage.queries++;
    usage.rowsRead += meta.rows_read ?? 0;
    usage.rowsWritten += meta.rows_written ?? 0;
  };
  const inner = new WeakMap<object, D1PreparedStatement>();
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
    const proxy = {
      bind: (...values: unknown[]) => wrap(statement.bind(...values)),
      async first(column?: string) {
        const result = await statement.all<Record<string, unknown>>();
        record(result.meta);
        const row = result.results[0] ?? null;
        return column ? (row?.[column] ?? null) : row;
      },
      async all() {
        const result = await statement.all();
        record(result.meta);
        return result;
      },
      async run() {
        const result = await statement.run();
        record(result.meta);
        return result;
      },
      async raw(options?: { columnNames?: boolean }) {
        return statement.raw(options as { columnNames: true });
      },
    } as unknown as D1PreparedStatement;
    inner.set(proxy, statement);
    return proxy;
  };
  const wrapped = {
    prepare: (sql: string) => wrap(db.prepare(sql)),
    async batch(statements: D1PreparedStatement[]) {
      const results = await db.batch(statements.map((statement) => inner.get(statement) ?? statement));
      for (const result of results) record(result.meta);
      return results;
    },
    exec: (sql: string) => db.exec(sql),
    withSession: () => {
      throw new Error('not measured');
    },
    dump: () => db.dump(),
  } as unknown as D1Database;
  return { db: wrapped, usage };
}

const ids = { alice: `Epic|${'a'.repeat(32)}|0`, bob: `Epic|${'b'.repeat(32)}|0` };

/** A game evening: two club players in the same team, both collectors sending every match. */
async function seedEvenings(evenings: number, matchesPerEvening = 12) {
  const db = env.DB;
  const writes: D1PreparedStatement[] = [];
  const start = Date.parse('2026-01-05T19:00:00Z');
  for (let evening = 0; evening < evenings; evening++) {
    const eveningStart = start + evening * 2.4 * 86_400_000;
    const day = new Date(eveningStart).toISOString().slice(0, 10);
    for (let match = 0; match < matchesPerEvening; match++) {
      const guid = `m-${evening}-${match}-`.padEnd(32, 'x');
      const won = (evening + match) % 2;
      const rows = [
        ['alice', ids.alice, 0],
        ['bob', ids.bob, 0],
        [`Opponent ${match}a`, `Steam|${evening}${match}1`, 1],
        [`Opponent ${match}b`, `Steam|${evening}${match}2`, 1],
      ].map(([name, playerId, team]) => ({
        matchGuid: guid,
        playerId: String(playerId),
        name: String(name),
        day,
        kind: 'match',
        team: Number(team),
        winner: won,
        score: 200 + match,
        goals: match % 3,
        assists: 1,
        saves: 2,
      }));
      const received = new Date(eveningStart + match * 420_000).toISOString();
      for (const sourceId of ['live-alice', 'live-bob']) {
        writes.push(
          ...((await observationWrites(
            db,
            { rows, rosters: [{ matchGuid: guid, playerCount: 4 }], sourceId, sourceType: 'collector' },
            received,
          )) as D1PreparedStatement[]),
        );
      }
      if (!won) {
        for (const player of ['alice', 'bob']) {
          writes.push(
            db
              .prepare(
                "INSERT INTO exercises (id, player, count, day, created, author, type) VALUES (?, ?, 10, ?, ?, ?, 'pushups')",
              )
              .bind(`ex-${guid}-${player}`, player, day, received, `member-${player}`),
            db
              .prepare("INSERT INTO exercise_reactions (exercise_id, author, emoji, created) VALUES (?, ?, '💪', ?)")
              .bind(`ex-${guid}-${player}`, player === 'alice' ? 'member-bob' : 'member-alice', received),
          );
        }
      }
      for (const player of ['alice', 'bob']) {
        writes.push(
          db
            .prepare('INSERT INTO mmr_entries (id, player, mmr, recorded_at) VALUES (?, ?, ?, ?)')
            .bind(`mmr-${guid}-${player}`, player, 1000 + evening + match, received),
        );
      }
    }
  }
  for (let index = 0; index < writes.length; index += 400) await db.batch(writes.slice(index, index + 400));
}

async function reset() {
  const tables = [
    'result_observations',
    'source_reports',
    'match_results',
    'match_builds',
    'sync_removals',
    'exercises',
    'exercise_reactions',
    'mmr_entries',
    'sessions',
    'collectors',
    'player_identities',
    'player_identity_aliases',
  ];
  await env.DB.batch(tables.map((table) => env.DB.prepare(`DELETE FROM ${table}`)));
}

async function measure(path: string, init: RequestInit = {}) {
  const { db, usage } = counting(env.DB);
  const response = await app.fetch(new Request(`https://app.test${path}`, init), { ...env, DB: db });
  const body = await response.text();
  return { status: response.status, bytes: body.length, body, etag: response.headers.get('etag'), ...usage };
}

/** What the Windows collector sends at the end of a match. */
function liveMatch(guid: string) {
  const now = Date.now();
  const players = [
    ['alice', ids.alice, 0],
    ['bob', ids.bob, 0],
    ['Opponent X', 'Steam|76561190000001001|0', 1],
    ['Opponent Y', 'Steam|76561190000001002|0', 1],
  ].map(([Name, PrimaryId, TeamNum]) => ({ Name, PrimaryId, TeamNum, Score: 250, Goals: 1, Assists: 0, Saves: 1 }));
  return {
    startedAt: now - 360_000,
    endedAt: now - 1000,
    seenIds: players.map((player) => player.PrimaryId),
    end: { MatchGuid: guid, WinnerTeamNum: 1 },
    state: {
      MatchGuid: guid,
      Players: players,
      Game: {
        PlaylistId: 11,
        Teams: [
          { Name: 'Blue', TeamNum: 0, Score: 1 },
          { Name: 'Orange', TeamNum: 1, Score: 3 },
        ],
        bHasWinner: true,
        bReplay: false,
        Winner: 'Orange',
      },
    },
  };
}

interface Measure {
  status: number;
  bytes: number;
  queries: number;
  rowsRead: number;
  rowsWritten: number;
}

const row = (evenings: number, request: string, { status, bytes, queries, rowsRead, rowsWritten }: Measure) => ({
  evenings,
  request,
  status,
  bytes,
  queries,
  rowsRead,
  rowsWritten,
});

/** Every page a board reads when it opens. */
async function openBoard(headers: Record<string, string>) {
  const total = { status: 200, bytes: 0, queries: 0, rowsRead: 0, rowsWritten: 0, pages: 0, version: 0 };
  for (let more = true; more; ) {
    const page = await measure(`/api/state?since=${total.version}`, { headers });
    const body = JSON.parse(page.body) as { version: number; more: boolean };
    total.bytes += page.bytes;
    total.queries += page.queries;
    total.rowsRead += page.rowsRead;
    total.rowsWritten += page.rowsWritten;
    total.pages++;
    total.version = body.version;
    more = body.more;
  }
  return total;
}

async function measureSeason(evenings: number) {
  const report: ReturnType<typeof row>[] = [];
  {
    await reset();
    await joinTestClub(env.DB);
    await env.DB.batch(
      (['alice', 'bob'] as const).flatMap((slot) => [
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
      ]),
    );
    await seedEvenings(evenings);
    const token = `session-${crypto.randomUUID()}`;
    await env.DB.prepare('INSERT INTO sessions (token_hash, member_id, expires) VALUES (?, ?, ?)')
      .bind(await sha256(token), 'member-alice', Date.now() + 365 * 86_400_000)
      .run();
    const headers = { Cookie: `session=${token}`, Origin: 'https://app.test', 'Content-Type': 'application/json' };

    // Once, after the deployment: every match received so far is built, a few hundred per request.
    const build = { status: 200, bytes: 0, queries: 0, rowsRead: 0, rowsWritten: 0, requests: 0 };
    for (let pending = true; pending; build.requests++) {
      const { db, usage } = counting(env.DB);
      pending = (await prepareBoard(db)).pending;
      build.queries += usage.queries;
      build.rowsRead += usage.rowsRead;
      build.rowsWritten += usage.rowsWritten;
    }
    report.push(row(evenings, `one-time build (${build.requests} requests)`, build));

    const full = await measure('/api/state', { headers });
    const fullAgain = await measure('/api/state', { headers: { ...headers, 'If-None-Match': full.etag ?? '' } });
    report.push(row(evenings, 'older page: whole board', full));
    report.push(row(evenings, 'older page: unchanged (304)', fullAgain));

    const opened = await openBoard(headers);
    report.push(row(evenings, `page opens (${opened.pages} pages)`, opened));
    const idle = await measure(`/api/state?since=${opened.version}&wait=0`, { headers });
    report.push(row(evenings, 'open board, nothing new (204)', idle));
    expect(idle.status).toBe(204);

    const live = await measure('/api/live', {
      method: 'POST',
      headers,
      body: JSON.stringify(liveMatch(`live-${evenings}`)),
    });
    report.push(row(evenings, 'collector sends a match', live));
    expect(live.body).toContain('"ok":true');
    const delta = await measure(`/api/state?since=${opened.version}&wait=0`, { headers });
    report.push(row(evenings, 'open board, after a match', delta));
    expect(JSON.parse(delta.body).results).toHaveLength(4);

    const monthly = await measure('/api/monthly', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'refresh' }),
    });
    report.push(row(evenings, 'monthly close check', monthly));
  }
  return report;
}

const rowsOf = (report: ReturnType<typeof row>[], request: string) =>
  report.find((line) => line.request === request)?.rowsRead ?? Number.NaN;

test('an open board costs the same few rows whatever the length of the history', { timeout: 120_000 }, async () => {
  const short = await measureSeason(4);
  const long = await measureSeason(24);
  console.log(`LOAD ${JSON.stringify([...short, ...long])}`);
  for (const request of ['open board, nothing new (204)', 'older page: unchanged (304)']) {
    expect(rowsOf(long, request)).toBeLessThanOrEqual(5);
  }
  for (const [request, budget] of [
    ['open board, after a match', 60],
    ['collector sends a match', 100],
    ['monthly close check', 15],
  ] as const) {
    expect(rowsOf(long, request)).toBeLessThanOrEqual(budget);
    expect(rowsOf(long, request)).toBeLessThanOrEqual(rowsOf(short, request) + 5);
  }
});
