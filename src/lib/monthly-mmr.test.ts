import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, test } from 'vitest';
import { players, roster } from './club-fixture';
import { closeMonthlyMmr, monthBounds, monthlyRanking, readMonthlyMmr, settleDrink } from './monthly-mmr';
import { type ObservedRank, type RankTarget, recordObservedRanks } from './rank-source';

const [first = '', second = '', third = ''] = roster;
const finalDay = '2026-11-30T21:00:00.000Z';
const closure = Date.parse('2026-11-30T23:05:00Z');

function declarations(values: (number | null)[] = [1200, 1100, 1000], at = finalDay) {
  return values.flatMap((mmr, i) => {
    const player = roster[i];
    return mmr === null || player === undefined ? [] : [{ player, mmr, recorded_at: at }];
  });
}

async function reset() {
  await env.DB.batch(
    [
      'mmr_entries',
      'player_ranks',
      'solo_mmr_entries',
      'solo_ranks',
      'monthly_mmr_results',
      'drink_debts',
      'player_identities',
    ].map((table) => env.DB.prepare(`DELETE FROM ${table}`)),
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
      env.DB.prepare('INSERT INTO mmr_entries (id,player,mmr,recorded_at) VALUES (?,?,?,?)').bind(
        crypto.randomUUID(),
        entry.player,
        entry.mmr,
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
});

describe('the best of the duo and solo accounts', () => {
  const lastDay = '2026-11-30T20:00:00.000Z';
  const earlier = '2026-11-20T20:00:00.000Z';
  const entry = (player: string, mmr: number, account: 'duo' | 'solo', recorded_at = lastDay) => ({
    player,
    mmr,
    account,
    recorded_at,
  });
  const duo = [entry(first, 1200, 'duo'), entry(second, 1100, 'duo'), entry(third, 1000, 'duo')];

  test('a better solo account counts, and the ranking says which account', () => {
    const result = monthlyRanking(roster, [...duo, entry(third, 1250, 'solo')], '2026-11');
    expect(result.rows.map((row) => [row.player, row.mmr, row.account])).toEqual([
      [third, 1250, 'solo'],
      [first, 1200, 'duo'],
      [second, 1100, 'duo'],
    ]);
    expect(result.status).toBe('final');
    expect(result.losers).toEqual([second]);
  });

  test('a better duo account counts, and the duo one wins a tie', () => {
    const result = monthlyRanking(roster, [...duo, entry(first, 1150, 'solo'), entry(second, 1100, 'solo')], '2026-11');
    expect(result.rows.map((row) => [row.player, row.mmr, row.account])).toEqual([
      [first, 1200, 'duo'],
      [second, 1100, 'duo'],
      [third, 1000, 'duo'],
    ]);
  });

  test('a solo account never read, or not read on the last day, does not hold the month back', () => {
    const result = monthlyRanking(roster, [...duo, entry(third, 1500, 'solo', earlier)], '2026-11');
    expect(result.status).toBe('final');
    expect(result.rows.find((row) => row.player === third)).toMatchObject({ mmr: 1000, account: 'duo' });
    expect(result.debts.every((debt) => debt.payer === third)).toBe(true);
  });

  test('either account read on the last day confirms the player', () => {
    const readings = [entry(first, 1200, 'duo'), entry(second, 1100, 'duo')];
    readings.push(entry(third, 1000, 'duo', earlier), entry(third, 990, 'solo'));
    const result = monthlyRanking(roster, readings, '2026-11');
    expect(result.status).toBe('final');
    expect(result.rows.find((row) => row.player === third)).toMatchObject({ mmr: 990, account: 'solo' });
  });

  test('the live ranking shows the best latest reading of each player', () => {
    const result = monthlyRanking(roster, [...duo, entry(second, 1300, 'solo', earlier)], '2026-11', { live: true });
    expect(result.rows[0]).toMatchObject({ player: second, mmr: 1300, account: 'solo', confirmedForClose: false });
  });
});

describe('closing with the rank source readings', () => {
  const targets: RankTarget[] = roster.flatMap((player, i): RankTarget[] => [
    { player, kind: 'duo', playerId: `Epic|synthetic-${i}|0` },
    { player, kind: 'solo', name: `${player} solo`, playerId: `Epic|${String(i).repeat(32)}|0` },
  ]);
  const reading = (player: string, kind: 'duo' | 'solo', mmr: number, observedAt: string): ObservedRank => ({
    player,
    kind,
    playerId: targets.find((target) => target.player === player && target.kind === kind)?.playerId ?? '',
    mmr,
    tier: 16,
    division: 2,
    matches: null,
    placements: null,
    observedAt,
  });
  const startsIn = (month: string) =>
    env.DB.prepare(
      'INSERT INTO monthly_mmr_policy (id, starts_month) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET starts_month = ?1',
    )
      .bind(month)
      .run();
  // The other tests close November from a policy that starts there.
  afterEach(() => startsIn('2026-11'));
  const record = (ranks: ObservedRank[]) => recordObservedRanks(env.DB, { ranks, unresolved: [], ignored: 0 }, targets);

  test('a rating unchanged on the last day is still confirmed by that day’s reading', async () => {
    await reset();
    await startsIn('2026-11');
    const values = [1200, 1100, 1000];
    await record(roster.map((player, i) => reading(player, 'duo', values[i] ?? 0, '2026-11-28T18:00:00.000Z')));
    await record([reading(third, 'solo', 1150, '2026-11-28T18:00:00.000Z')]);
    // Several unchanged readings on the last day: one confirmation entry per account, not one per reading.
    for (const at of ['2026-11-30T08:00:00.000Z', '2026-11-30T21:00:00.000Z']) {
      await record([
        ...roster.map((player, i) => reading(player, 'duo', values[i] ?? 0, at)),
        reading(third, 'solo', 1150, at),
      ]);
    }
    expect(await count('SELECT COUNT(*) AS n FROM mmr_entries')).toBe(6);
    expect(await count('SELECT COUNT(*) AS n FROM solo_mmr_entries')).toBe(2);
    await closeMonthlyMmr(env.DB, roster, closure);
    const closed = await env.DB.prepare(
      "SELECT status, snapshot FROM monthly_mmr_results WHERE month = '2026-11'",
    ).first<{
      status: string;
      snapshot: string;
    }>();
    expect(closed?.status).toBe('final');
    const snapshot = JSON.parse(closed?.snapshot ?? '{}') as {
      losers: string[];
      rows: { player: string; account: string }[];
    };
    expect(snapshot.losers).toEqual([second]);
    expect(snapshot.rows.find((row) => row.player === third)?.account).toBe('solo');
    expect((await debts()).map((debt) => debt.recipient).sort()).toEqual([first, third].sort());
  });

  test('a closed month and its drinks keep their values when solo readings arrive afterwards', async () => {
    await reset();
    // A month closed before solo accounts counted: its rows name no account.
    const snapshot = JSON.stringify({
      month: '2026-10',
      status: 'final',
      losers: [third],
      rows: roster.map((player, i) => ({
        player,
        mmr: 1200 - i * 100,
        recordedAt: '2026-10-31T21:00:00.000Z',
        confirmedForClose: true,
      })),
    });
    await startsIn('2026-10');
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO monthly_mmr_results (month, cutoff_at, closed_at, status, snapshot) VALUES ('2026-10', '2026-10-31T23:00:00.000Z', '2026-10-31T23:05:00.000Z', 'final', ?)",
      ).bind(snapshot),
      ...[first, second].map((recipient) =>
        env.DB.prepare('INSERT INTO drink_debts (id, month, payer, recipient) VALUES (?, ?, ?, ?)').bind(
          `2026-10:${third}:${recipient}`,
          '2026-10',
          third,
          recipient,
        ),
      ),
    ]);
    const before = await env.DB.batch([
      env.DB.prepare('SELECT * FROM monthly_mmr_results'),
      env.DB.prepare('SELECT * FROM drink_debts ORDER BY id'),
    ]);
    await record([reading(third, 'solo', 1900, '2026-10-31T21:30:00.000Z')]);
    await closeMonthlyMmr(env.DB, roster, closure);
    const after = await env.DB.batch([
      env.DB.prepare("SELECT * FROM monthly_mmr_results WHERE month = '2026-10'"),
      env.DB.prepare("SELECT * FROM drink_debts WHERE month = '2026-10' ORDER BY id"),
    ]);
    expect(after.map((answer) => answer.results)).toEqual(before.map((answer) => answer.results));
  });
});

describe('monthly MMR storage', () => {
  test('the live ranking reads the rank source entries', async () => {
    await reset();
    await owners();
    await seed([1200, 1100, 1000]);
    const monthly = await readMonthlyMmr(env.DB, players, 'current-user', Date.parse(finalDay));
    expect(monthly.allowedPlayers).toEqual([first]);
    expect(monthly.current.rows.map((row) => row.mmr)).toEqual([1200, 1100, 1000]);
    expect('debts' in monthly.current).toBe(false);
    expect('publicSync' in monthly).toBe(false);
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
    test(`${name}: the result is archived without debt, even with an old frozen rank present`, async () => {
      await reset();
      await env.DB.batch(
        roster.map((player, i) =>
          env.DB.prepare('INSERT INTO player_ranks (player,player_id,mmr,status,last_attempt) VALUES (?,?,?,?,?)').bind(
            player,
            'public-synthetic',
            1200 - i * 100,
            'frozen',
            '2026-11-01T12:00:00Z',
          ),
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

  // A malformed drink is refused by the API's input schema (src/worker/inputs.test.ts).
  test('an unknown drink is refused', async () => {
    await reset();
    await expect(settleDrink(env.DB, roster, 'current-user', 'missing')).rejects.toMatchObject({ status: 404 });
  });
});
