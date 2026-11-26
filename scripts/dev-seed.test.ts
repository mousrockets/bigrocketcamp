import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { prepareBoard, readFullBoard } from '../src/lib/board';
import { rosterOf } from '../src/lib/club';
import { clubStats } from '../src/lib/domain';
import { devSeed, devSeedTables, rankOf } from './dev-seed';

// A Thursday morning: two closed months behind, an evening of matches yesterday.
const now = Date.parse('2026-11-26T10:00:00Z');

async function seed(at = now) {
  const statements = await devSeed(at);
  await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));
}

async function count(table: string): Promise<number> {
  return (await env.DB.prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>())?.n ?? 0;
}

async function board() {
  let prepared = await prepareBoard(env.DB);
  for (let round = 0; prepared.pending && round < 20; round++) prepared = await prepareBoard(env.DB);
  const full = await readFullBoard({ db: env.DB, memberId: 'member-dimitri', hasRankSource: false }, prepared.players);
  return { ...full, roster: rosterOf(prepared.players) };
}

describe('the fictitious club of npm run db:seed', () => {
  beforeAll(() => seed());

  it('gives the club months of matches, built by the app like the ones a collector sends', async () => {
    const { results } = await board();
    const days = new Set(results.map((row) => row.day));
    expect(results.length).toBeGreaterThan(1500);
    expect([...days].some((day) => day.startsWith('2026-09'))).toBe(true);
    expect([...days].some((day) => day.startsWith('2026-11'))).toBe(true);
    expect(new Set(results.map((row) => row.playlist))).toEqual(new Set([11, 13, 34, null]));
    expect(results.some((row) => row.forfeit)).toBe(true);
    expect(results.some((row) => row.overtime)).toBe(true);
    expect(results.every((row) => row.verification !== 'review')).toBe(true);
  });

  it('leaves one player owing pushups while the others are clear', async () => {
    const { results, exercises, matchRosters, rules, roster } = await board();
    const left = clubStats({ results, exercises, matchRosters, rules }, roster, '2026-11-26').map(
      (player) => player.remaining,
    );
    expect(left.filter((pushups) => pushups > 0)).toHaveLength(1);
  });

  it('closes the past months as the hourly task does, one drink still to offer', async () => {
    const months = await env.DB.prepare('SELECT month, status FROM monthly_mmr_results ORDER BY month').all();
    expect(months.results).toEqual([
      { month: '2026-09', status: 'final' },
      { month: '2026-10', status: 'final' },
    ]);
    const unpaid = await env.DB.prepare('SELECT month FROM drink_debts WHERE paid_at IS NULL').all();
    expect(unpaid.results).toEqual([{ month: '2026-10' }]);
  });

  it('writes nothing twice when it runs again', async () => {
    const tables = ['result_observations', 'source_reports', 'exercises', 'mmr_entries', 'drink_debts', 'members'];
    const before = await Promise.all(tables.map(count));
    await seed();
    expect(await Promise.all(tables.map(count))).toEqual(before);
  });

  it('writes the same days the same way when it runs again later', async () => {
    const first = await devSeedTables(now);
    // On 6 December, the seed starts on 1 October, Paris time.
    const later = await devSeedTables(now + 10 * 86_400_000);
    const at = (row: Record<string, unknown>) => String(row.received ?? row.created ?? row.recorded_at);
    for (const table of ['result_observations', 'exercises', 'mmr_entries', 'solo_mmr_entries'] as const) {
      const kept = new Map(later[table].map((row) => [row.id, JSON.stringify(row)]));
      const shared = first[table].filter((row) => at(row) >= '2026-09-30T22:00:00.000Z');
      expect(shared.length).toBeGreaterThan(0);
      expect(shared.every((row) => kept.get(row.id) === JSON.stringify(row))).toBe(true);
    }
  });

  it('only shows fictitious people', async () => {
    const tables = await devSeedTables(now);
    expect(tables.members.every((member) => String(member.email).endsWith('@example.com'))).toBe(true);
    const players = tables.result_observations.map((row) => String(row.player_id));
    expect(players.every((id) => id.includes('|seed-') || id.endsWith('-dev|0'))).toBe(true);
  });
});

describe('the rank of a doubles rating', () => {
  it('reads the tier and the division from the thresholds', () => {
    expect(rankOf(1075)).toEqual({ tier: 16, division: 1 });
    expect(rankOf(1194)).toEqual({ tier: 16, division: 4 });
    expect(rankOf(1440)).toEqual({ tier: 19, division: 1 });
  });
});
