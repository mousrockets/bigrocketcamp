import { env } from 'cloudflare:workers';
import { describe, expect, test } from 'vitest';
import { roster } from './club';
import { dailyRecap, normalizeParticipant, parisDay, summarize } from './domain';
import { validateMatchRosters } from './match-rules';
import { observationWrites, readMerged, reconcile } from './reconcile';

const [first = '', second = ''] = roster;

const row = {
  match_guid: 'm',
  player_id: 'Epic|synthetic|0',
  name: second,
  day: '2026-11-04',
  kind: 'match',
  team: 0,
  winner: 1,
  score: 200,
  goals: 1,
  assists: 2,
  saves: 0,
  received: '2026-11-05T10:00:00Z',
};

type Row = typeof row;

function observation(payload: Row, sourceType = 'epic', sourceId = 'synthetic', received = '2026-11-05T11:00:00Z') {
  return {
    match_guid: payload.match_guid,
    payload: JSON.stringify(payload),
    source_type: sourceType,
    source_id: sourceId,
    received,
  };
}

function only<T>(items: T[], index = 0): T {
  const item = items[index];
  if (!item) throw new Error(`expected an item at index ${index}`);
  return item;
}

async function clearSources() {
  await env.DB.batch(
    ['results', 'match_rosters', 'result_observations', 'source_reports', 'player_identity_aliases'].map((table) =>
      env.DB.prepare(`DELETE FROM ${table}`),
    ),
  );
}

describe('reconcile', () => {
  test('history union: common matches once, old matches outside the window kept', () => {
    const legacy = [row, { ...row, match_guid: 'old-only' }];
    const epic = [observation(row), observation({ ...row, match_guid: 'new-only' })];
    const result = reconcile(legacy, epic);
    expect(result.rows.length).toBe(3);
    expect(result.rows.find((r) => r.match_guid === 'm')?.verification).toBe('confirmed');
    expect(only(summarize(result.rows, [], ''), 1).due).toBe(15);
  });

  test('an Epic correction takes result and stats from the same snapshot', () => {
    const epic = { ...row, winner: 0, score: 100, goals: 0, assists: 0, saves: 3 };
    const merged = reconcile([row], [observation(epic)]);
    const chosen = only(merged.rows);
    expect([chosen.winner, chosen.score, chosen.goals, chosen.assists, chosen.saves]).toEqual([0, 100, 0, 0, 3]);
    expect(chosen.verification).toBe('corrected');
    expect(only(summarize(merged.rows, [], ''), 1).due).toBe(0);
  });

  test('two contradictory PC results need review, with no debt and no false win', () => {
    const merged = reconcile([row], [observation({ ...row, winner: 0 }, 'collector', 'other')]);
    expect(only(merged.rows).review_required).toBe(true);
    expect(only(summarize(merged.rows, [], ''), 1).played).toBe(0);
    expect(only(dailyRecap(merged.rows, row.day).players, 1).generated).toBe(0);
  });

  test('a contradiction from the same collector is kept; a test upgraded to a match stays valid', () => {
    const contradiction = reconcile(
      [],
      [observation(row, 'collector'), observation({ ...row, winner: 0 }, 'collector')],
    );
    expect(only(contradiction.rows).review_required).toBe(true);
    expect(only(reconcile([{ ...row, kind: 'test' }], [observation(row, 'collector')]).rows).review_required).toBe(
      false,
    );
  });

  test('PSN and PS4 are deduplicated; different IDs are never merged by nickname', () => {
    const platforms = reconcile(
      [{ ...row, player_id: 'PSN|synthetic|0' }],
      [observation({ ...row, player_id: 'PS4|synthetic|0' })],
    );
    expect(platforms.rows.length).toBe(1);
    const result = reconcile([row], [observation({ ...row, player_id: 'Epic|other|0' })]);
    expect(result.rows.length).toBe(1);
    expect(only(result.rows).source_difference).toBe('identity');
    expect(only(summarize(result.rows, [], ''), 1).due).toBe(0);
  });

  test('a scoreboard is complete only when a coherent report matches every kept row', () => {
    const opponent = { ...row, player_id: 'Epic|opponent|0', name: 'Opponent', team: 1 };
    const report = {
      match_guid: 'm',
      expected_players: 2,
      source_type: 'epic',
      received: 'now',
      players: JSON.stringify([row, opponent]),
    };
    const complete = reconcile([], [observation(row), observation(opponent)], [], [report]);
    expect(complete.rosters.length).toBe(1);
    const changed = reconcile(
      [],
      [observation({ ...row, score: 250 }), observation(opponent)],
      [{ match_guid: 'm', expected_players: 2 }],
      [report],
    );
    expect(changed.rosters.length).toBe(0);
  });

  test('stored observations keep each snapshot whole, with no per-column MAX, and repeats are idempotent', async () => {
    await clearSources();
    const player = {
      MatchGuid: 'm',
      PlayerId: row.player_id,
      Name: row.name,
      Day: row.day,
      Kind: 'match',
      Team: 0,
      Winner: 1,
      Score: 200,
      Goals: 2,
      Assists: 0,
      Saves: 0,
    };
    const send = async (input: typeof player) => {
      const rows = [input].map(normalizeParticipant).filter((r) => r !== null);
      const writes = await observationWrites(
        env.DB,
        { rows, rosters: [], sourceId: 'synthetic', sourceType: 'collector' },
        new Date().toISOString(),
      );
      await env.DB.batch(writes as D1PreparedStatement[]);
    };
    await send(player);
    await send({ ...player, Score: 250, Goals: 0, Saves: 3 });
    await send({ ...player, Score: 250, Goals: 0, Saves: 3 });
    const merged = await readMerged(env.DB);
    expect(merged.rows.length).toBe(1);
    expect(only(merged.rows).goals).toBe(0);
    expect(only(merged.rows).saves).toBe(3);
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM result_observations WHERE source_id='synthetic'",
    ).first<{ n: number }>();
    expect(count?.n).toBe(2);
  });

  test('observation writes refuse an unknown source type', async () => {
    await expect(
      observationWrites(env.DB, { rows: [], rosters: [], sourceId: 'synthetic', sourceType: 'other' }, 'now'),
    ).rejects.toThrow('Source invalide.');
  });
});

describe('collector rosters', () => {
  const base = {
    MatchGuid: 'complete-match',
    PlayerId: 'Epic|p1|0',
    Name: first,
    Day: parisDay(),
    Kind: 'match',
    Team: 0,
    Winner: 1,
    Score: 200,
    Goals: 1,
    Assists: 0,
    Saves: 1,
  };
  const results = [base, { ...base, PlayerId: 'PSN|p2|0', Name: 'opponent', Team: 1, Score: 50 }];
  const matches = [{ MatchGuid: base.MatchGuid, PlayerCount: 2 }];

  async function ingest(input: typeof results, declaredMatches: unknown) {
    const rows = input.map(normalizeParticipant).filter((r) => r !== null);
    const rosters = validateMatchRosters(declaredMatches, rows);
    const writes = await observationWrites(
      env.DB,
      { rows, rosters, sourceId: 'history-test', sourceType: 'collector' },
      new Date().toISOString(),
    );
    await env.DB.batch(writes as D1PreparedStatement[]);
  }

  test('a complete collection keeps opponents, exposes the roster and avoids duplicates', async () => {
    await clearSources();
    await ingest(results, matches);
    await ingest(results, matches);
    const merged = await readMerged(env.DB);
    expect(merged.rows.length).toBe(2);
    expect(merged.rosters.length).toBe(1);
    expect(merged.rows.some((r) => r.name === 'opponent')).toBe(true);
    const player = only(
      dailyRecap(merged.rows, parisDay(), merged.rosters, { enabled: true, effectiveFrom: '2026-11-05', ties: 'none' })
        .players,
    );
    expect([player.played, player.losses, player.lowest, player.generated]).toEqual([1, 1, 0, 5]);
  });

  test('a legacy collector stays compatible, but the ranking is unknown without a complete scoreboard', async () => {
    await clearSources();
    await ingest([base], undefined);
    const merged = await readMerged(env.DB);
    expect(merged.rosters.length).toBe(0);
    expect(only(dailyRecap(merged.rows, parisDay(), merged.rosters).players).unranked).toBe(1);
  });

  test('a scoreboard announced complete with a missing player is refused before any write', async () => {
    await clearSources();
    await expect(ingest(results, [{ MatchGuid: base.MatchGuid, PlayerCount: 4 }])).rejects.toThrow(
      'Tableau des scores incomplet ou incohérent.',
    );
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM result_observations').first<{ n: number }>();
    expect(count?.n).toBe(0);
  });
});
