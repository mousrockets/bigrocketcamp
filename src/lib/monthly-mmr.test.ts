import { env } from 'cloudflare:workers';
import { describe, expect, test } from 'vitest';
import { players, roster } from './club-fixture';
import { readDoublesRanks } from './doubles-ranks';
import {
  closeMonthlyMmr,
  monthBounds,
  monthlyRanking,
  readMonthlyMmr,
  recordMmr,
  settleDrink,
  validateMmrEntry,
} from './monthly-mmr';

const [first = '', second = '', third = ''] = roster;
const finalDay = '2026-11-30T21:00:00.000Z';
const closure = Date.parse('2026-11-30T23:05:00Z');

function declarations(values: (number | null)[] = [1200, 1100, 1000], at = finalDay) {
  return values.flatMap((mmr, i) => {
    const player = roster[i];
    return mmr === null || player === undefined ? [] : [{ player, mmr, recorded_at: at }];
  });
}

const input = (player = first, mmr: unknown = 1200, id: string = crypto.randomUUID()) => ({ id, player, mmr });

async function reset() {
  await env.DB.batch(
    ['mmr_entries', 'player_ranks', 'monthly_mmr_results', 'drink_debts', 'player_identities', 'public_mmr_sync'].map(
      (table) => env.DB.prepare(`DELETE FROM ${table}`),
    ),
  );
}

async function owners() {
  await env.DB.batch(
    roster.map((player, i) =>
      env.DB.prepare('INSERT INTO player_identities (slot,owner,player_id) VALUES (?,?,?)').bind(
        player,
        i === 0 ? 'current-user' : `member-${i}`,
        `Epic|synthetic-${i}|0`,
      ),
    ),
  );
}

async function seed(values?: (number | null)[], at = finalDay) {
  await env.DB.batch(
    declarations(values, at).map((entry) =>
      env.DB.prepare('INSERT INTO mmr_entries (id,player,mmr,author,recorded_at) VALUES (?,?,?,?,?)').bind(
        crypto.randomUUID(),
        entry.player,
        entry.mmr,
        'synthetic-author',
        entry.recorded_at,
      ),
    ),
  );
}

interface DebtRow {
  id: string;
  recipient: string;
  paid_at: string | null;
  paid_by: string | null;
}

async function debts() {
  return (await env.DB.prepare('SELECT * FROM drink_debts ORDER BY recipient').all<DebtRow>()).results;
}

async function count(sql: string) {
  return (await env.DB.prepare(sql).first<{ n: number }>())?.n;
}

describe('monthly MMR ranking', () => {
  test('Paris calendar months: winter, next year, leap February and both clock changes', () => {
    const november = monthBounds('2026-11');
    expect(november.startAt).toBe('2026-10-31T23:00:00.000Z');
    expect(november.cutoffAt).toBe('2026-11-30T23:00:00.000Z');
    expect(november.lastDay).toBe('2026-11-30');
    expect(monthBounds('2026-12').cutoffAt).toBe('2026-12-31T23:00:00.000Z');
    expect(monthBounds('2028-02').lastDay).toBe('2028-02-29');
    for (const [month, hours] of [
      ['2026-03', 743],
      ['2026-10', 745],
    ] as const) {
      const bounds = monthBounds(month);
      expect((Date.parse(bounds.cutoffAt) - Date.parse(bounds.startAt)) / 3600000).toBe(hours);
    }
    expect(() => monthBounds('2026-13')).toThrow();
    expect(() => monthBounds('no-month')).toThrow();
  });

  const closings: [(number | null)[], string, number][] = [
    [[1200, 1100, 1000], 'final', 2],
    [[1200, 1000, 1000], 'tied', 0],
    [[1000, 1000, 1000], 'tied', 0],
    [[1200, 1200, 1000], 'final', 2],
    [[1200, 1100, 0], 'final', 2],
    [[1200, 1100, null], 'incomplete', 0],
  ];
  for (const [values, status, drinks] of closings) {
    test(`closing ${values.join('/')}: ${status}, ${drinks} drinks`, () => {
      const result = monthlyRanking(roster, declarations(values), '2026-11');
      expect(result.status).toBe(status);
      expect(result.debts.length).toBe(drinks);
      if (drinks) {
        expect(result.debts.map((d) => d.recipient).sort()).toEqual([first, second].sort());
        expect(result.debts.every((d) => d.payer === third)).toBe(true);
      }
    });
  }

  test('only the last reading before Paris midnight counts; an old reading does not confirm the month end', () => {
    const all = declarations([1200, 1100, 1000]);
    all.push({ player: third, mmr: 1300, recorded_at: '2026-11-30T22:59:59.999Z' });
    all.push({ player: second, mmr: 0, recorded_at: '2026-11-30T23:00:00.000Z' });
    const result = monthlyRanking(roster, all, '2026-11');
    expect(result.rows.map((r) => r.mmr)).toEqual([1300, 1200, 1100]);
    expect(result.debts[0]?.payer).toBe(second);
    const stale = monthlyRanking(roster, declarations([1200, 1100, 1000], '2026-11-29T22:59:59.999Z'), '2026-11');
    expect(stale.status).toBe('incomplete');
    expect(stale.missing.length).toBe(3);
    expect(stale.debts.length).toBe(0);
  });

  test('validation: integers only, zero is valid, rank and division must agree', () => {
    for (const mmr of [-1, 10001, 1.5, Number.NaN, '1200', null]) {
      expect(() => validateMmrEntry(roster, input(first, mmr))).toThrow();
    }
    expect(validateMmrEntry(roster, input(first, 0)).mmr).toBe(0);
    expect(() => validateMmrEntry(roster, { ...input(), tier: 17 })).toThrow();
    expect(() => validateMmrEntry(roster, { ...input(), tier: 22, division: 1 })).toThrow();
    expect(validateMmrEntry(roster, { ...input(), tier: 17, division: 2 }).division).toBe(2);
  });
});

describe('monthly MMR storage', () => {
  test('owner only, no client date, idempotent entry, 2v2 rank updated without inventing a tier', async () => {
    await reset();
    await owners();
    const value = input();
    await expect(recordMmr(env.DB, roster, 'current-user', input(second))).rejects.toMatchObject({ status: 403 });
    const before = Date.now();
    expect(
      await recordMmr(env.DB, roster, 'current-user', {
        ...value,
        recorded_at: '2020-01-01T00:00:00Z',
        month: '2020-01',
      }),
    ).toEqual({ ok: true, player: first });
    const saved = await env.DB.prepare('SELECT recorded_at FROM mmr_entries WHERE id=?')
      .bind(value.id)
      .first<{ recorded_at: string }>();
    expect(Date.parse(saved?.recorded_at ?? '')).toBeGreaterThanOrEqual(before - 1000);
    await recordMmr(env.DB, roster, 'current-user', value);
    expect(await count('SELECT count(*) AS n FROM mmr_entries')).toBe(1);
    await expect(recordMmr(env.DB, roster, 'current-user', { ...value, mmr: 1190 })).rejects.toMatchObject({
      status: 409,
    });

    const rank = (await readDoublesRanks(env.DB, roster))[0];
    expect(rank?.mmr).toBe(1200);
    expect(rank?.label).toBe('Rang non renseigné');
    expect(rank?.status).toBe('manual');

    const monthly = await readMonthlyMmr(env.DB, players, 'current-user');
    expect(monthly.allowedPlayers[0]).toBe(first);
    expect(monthly.current.rows[0]?.mmr).toBe(1200);
    expect(JSON.stringify(monthly)).not.toContain('current-user');
    expect('debts' in monthly.current).toBe(false);
  });

  test('a retry of an older entry in the same millisecond keeps the last MMR shown and ranked', async () => {
    await reset();
    await owners();
    const older = input(first, 1200);
    const latest = input(first, 1250);
    await recordMmr(env.DB, roster, 'current-user', older);
    await recordMmr(env.DB, roster, 'current-user', latest);
    await env.DB.prepare('UPDATE mmr_entries SET recorded_at=?').bind(finalDay).run();
    await env.DB.prepare('UPDATE player_ranks SET fetched_at=?').bind(finalDay).run();
    await recordMmr(env.DB, roster, 'current-user', latest);
    await recordMmr(env.DB, roster, 'current-user', older);
    const rank = await env.DB.prepare('SELECT mmr FROM player_ranks').first<{ mmr: number }>();
    expect(rank?.mmr).toBe(1250);
    expect((await readMonthlyMmr(env.DB, players, 'current-user', Date.parse(finalDay))).current.rows[0]?.mmr).toBe(
      1250,
    );
  });

  test('closing waits for the end and the grace period, is never retroactive, and creates two drinks', async () => {
    await reset();
    await seed();
    expect((await closeMonthlyMmr(env.DB, roster, Date.parse('2026-11-20T12:00:00Z'))).closed).toBe(0);
    expect((await closeMonthlyMmr(env.DB, roster, closure - 1)).closed).toBe(0);
    expect((await debts()).length).toBe(0);
    expect((await closeMonthlyMmr(env.DB, roster, closure)).closed).toBe(1);
    expect((await debts()).length).toBe(2);
    const results = await env.DB.prepare('SELECT month,status FROM monthly_mmr_results').all();
    expect(results.results).toEqual([{ month: '2026-11', status: 'final' }]);
    const archive = await env.DB.prepare('SELECT snapshot FROM monthly_mmr_results').first<{ snapshot: string }>();
    await seed([1500, 1400, 2000], '2026-11-30T23:01:00.000Z');
    await closeMonthlyMmr(env.DB, roster, closure + 1000);
    const after = await env.DB.prepare('SELECT snapshot FROM monthly_mmr_results').first<{ snapshot: string }>();
    expect(after?.snapshot).toBe(archive?.snapshot);
    expect((await debts()).length).toBe(2);
  });

  const archived: [string, (number | null)[], boolean, string][] = [
    ['tie', [1200, 1000, 1000], false, 'tied'],
    ['missing reading', [1200, 1100, null], false, 'incomplete'],
    ['readings too old', [1200, 1100, 1000], true, 'incomplete'],
  ];
  for (const [name, values, stale, status] of archived) {
    test(`${name}: the result is archived without debt, even with old Epic MMRs present`, async () => {
      await reset();
      await env.DB.batch(
        roster.map((player, i) =>
          env.DB.prepare(
            'INSERT INTO player_ranks (player,player_id,playlist,mmr,status,last_attempt) VALUES (?,?,11,?,?,?)',
          ).bind(player, 'public-synthetic', 1200 - i * 100, 'frozen', '2026-11-01T12:00:00Z'),
        ),
      );
      await seed(values, stale ? '2026-11-01T12:00:00.000Z' : finalDay);
      await closeMonthlyMmr(env.DB, roster, closure);
      const result = await env.DB.prepare('SELECT status FROM monthly_mmr_results').first<{ status: string }>();
      expect(result?.status).toBe(status);
      expect((await debts()).length).toBe(0);
    });
  }

  test('concurrent closings and retries: one result and one drink per recipient', async () => {
    await reset();
    await seed();
    await Promise.all([closeMonthlyMmr(env.DB, roster, closure), closeMonthlyMmr(env.DB, roster, closure)]);
    await closeMonthlyMmr(env.DB, roster, closure + 60000);
    expect(await count('SELECT count(*) AS n FROM monthly_mmr_results')).toBe(1);
    expect((await debts()).length).toBe(2);
  });

  test('an offered drink: only the two players involved, idempotent, undone by its author within 24 h', async () => {
    await reset();
    await owners();
    await seed();
    await closeMonthlyMmr(env.DB, roster, closure);
    const debt = (await debts()).find((d) => d.recipient === first);
    if (!debt) throw new Error('expected a drink for the first player');
    await expect(settleDrink(env.DB, roster, 'member-1', debt.id, false, closure)).rejects.toMatchObject({
      status: 403,
    });
    await settleDrink(env.DB, roster, 'current-user', debt.id, false, closure);
    await settleDrink(env.DB, roster, 'member-2', debt.id, false, closure + 1000);
    const paid = await env.DB.prepare('SELECT paid_by FROM drink_debts WHERE id=?')
      .bind(debt.id)
      .first<{ paid_by: string }>();
    expect(paid?.paid_by).toBe('current-user');
    await expect(settleDrink(env.DB, roster, 'member-2', debt.id, true, closure + 2000)).rejects.toMatchObject({
      status: 403,
    });
    const monthly = await readMonthlyMmr(env.DB, players, 'current-user', closure + 1000);
    expect(monthly.debts.find((d) => d.id === debt.id)?.canUndo).toBe(true);
    await expect(settleDrink(env.DB, roster, 'current-user', debt.id, true, closure + 86400001)).rejects.toMatchObject({
      status: 403,
    });
    await settleDrink(env.DB, roster, 'current-user', debt.id, true, closure + 86400000);
    const undone = await env.DB.prepare('SELECT paid_at FROM drink_debts WHERE id=?')
      .bind(debt.id)
      .first<{ paid_at: string | null }>();
    expect(undone?.paid_at).toBe(null);
  });

  test('an unknown or malformed drink is refused', async () => {
    await reset();
    await expect(settleDrink(env.DB, roster, 'current-user', 'x'.repeat(161))).rejects.toThrow('Dette invalide.');
    await expect(settleDrink(env.DB, roster, 'current-user', 'missing')).rejects.toMatchObject({ status: 404 });
  });
});
