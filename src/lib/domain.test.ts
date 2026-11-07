import { env } from 'cloudflare:workers';
import { describe, expect, test } from 'vitest';
import { roster } from './club-fixture';
import { parisDay } from './days';
import {
  dailyRecap,
  exerciseDescription,
  exerciseEffect,
  exerciseReceipt,
  normalizeResult,
  pushupCredit,
  summarize,
  validateExercise,
} from './domain';

const [first = '', second = '', third = ''] = roster;

const base = {
  MatchGuid: 'match-1',
  PlayerId: 'Epic|1',
  Name: second.toUpperCase(),
  Day: '2026-11-04',
  Kind: 'match',
  Team: 0,
  Winner: 1,
  Score: 300,
  Goals: 1,
  Assists: 0,
  Saves: 2,
};

function normalized(input: Record<string, unknown>) {
  const result = normalizeResult(roster, input);
  if (!result) throw new Error('expected a tracked player');
  return result;
}

function secondPlayer<T>(players: T[]): T {
  const player = players[1];
  if (!player) throw new Error('expected a second roster player');
  return player;
}

describe('domain', () => {
  test('a win comes from the team, never from a provided boolean', () => {
    const result = normalized({ ...base, Victory: true });
    expect(secondPlayer(summarize(roster, [result], [], '')).due).toBe(5);
    expect(secondPlayer(summarize(roster, [{ ...result, team: 1 }], [], '')).wins).toBe(1);
  });

  test('bot tests are excluded and training without a GUID is refused', () => {
    expect(() => normalizeResult(roster, { ...base, MatchGuid: '' })).toThrow();
    expect(secondPlayer(summarize(roster, [normalized({ ...base, Kind: 'test' })], [], '')).played).toBe(0);
  });

  test('the done total is kept beyond the debt and days are filtered', () => {
    const summary = secondPlayer(summarize(roster, [normalized(base)], [{ player: second, count: 25 }], '2026-11-05'));
    expect([summary.played, summary.due, summary.done, summary.remaining]).toEqual([0, 5, 25, 0]);
  });

  test('negative counts, fractions and invalid days are rejected', () => {
    const exercise = { id: '1234567890123456', player: second, count: 5, day: '2026-11-04' };
    for (const patch of [{ count: -1 }, { count: 1.5 }, { count: 0 }, { day: '2026-02-31' }, { player: 'intruder' }]) {
      expect(() => validateExercise(roster, { ...exercise, ...patch })).toThrow();
    }
    expect(validateExercise(roster, exercise).count).toBe(5);
  });

  test('the Paris day crosses UTC midnight', () => {
    expect(parisDay(new Date('2026-11-04T23:30:00Z'))).toBe('2026-11-05');
  });

  test('the SQL keys deduplicate a match player and a repeated exercise', async () => {
    await env.DB.batch([env.DB.prepare('DELETE FROM prototype_results'), env.DB.prepare('DELETE FROM exercises')]);
    const insertResult = (playerId: string, name: string) =>
      env.DB.prepare(
        'INSERT INTO prototype_results VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(match_guid,player_id) DO NOTHING',
      ).bind('m', playerId, name, '2026-11-04', 'match', 0, 1, 10, 0, 0, 0, 'now');
    for (let i = 0; i < 3; i++) await insertResult('p', second).run();
    await insertResult('p2', first).run();
    const results = await env.DB.prepare('SELECT COUNT(*) AS n FROM prototype_results').first<{ n: number }>();
    expect(results?.n).toBe(2);

    const insertExercise = () =>
      env.DB.prepare(
        'INSERT INTO exercises (id,player,count,day,created,author) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
      ).bind('id', second, 5, '2026-11-04', 'now', 'u');
    await insertExercise().run();
    await insertExercise().run();
    const exercises = await env.DB.prepare('SELECT SUM(count) AS n FROM exercises').first<{ n: number }>();
    expect(exercises?.n).toBe(5);
  });

  test('a PS5 identity is accepted and the name is normalized', () => {
    expect(normalized({ ...base, Name: third, PlayerId: 'PSN|123' }).name).toBe(third);
  });

  test('30 pushups due, a one-minute plank and 20 crunches leave 5 pushups', () => {
    const rows = Array.from({ length: 6 }, () => normalized(base));
    const exercises = [
      { player: second, type: 'plank', count: 60 },
      { player: second, type: 'crunches', count: 20 },
    ];
    const summary = secondPlayer(summarize(roster, rows, exercises, '2026-11-04'));
    expect([
      summary.due,
      summary.done,
      summary.remaining,
      summary.pushups,
      summary.plankSeconds,
      summary.crunches,
    ]).toEqual([30, 25, 5, 0, 60, 20]);
  });

  test('legacy exercises, exact fractions, and players and days kept apart', () => {
    const rows = [normalized(base), normalized({ ...base, Kind: 'test' })];
    const exercises = [
      { player: second, count: 2 },
      { player: second, type: 'plank', count: 15 },
      { player: second, type: 'crunches', count: 1 },
      { player: first, type: 'plank', count: 60 },
    ];
    const [other, summary] = summarize(roster, rows, exercises, '2026-11-05');
    if (!other || !summary) throw new Error('expected two roster players');
    expect([
      summary.played,
      summary.due,
      summary.done,
      summary.remaining,
      summary.pushups,
      summary.plankSeconds,
      summary.crunches,
    ]).toEqual([0, 5, 6.25, 0, 2, 15, 1]);
    expect([other.done, other.plankSeconds]).toEqual([15, 60]);
    expect(pushupCredit({ type: 'plank', count: 1 })).toBe(0.25);
    expect(exerciseDescription({ type: 'plank', count: 90 })).toBe('1,5 min de gainage');
    expect(exerciseDescription({ count: 2 })).toBe('2 pompes');
    expect(exerciseDescription({ type: 'crunches', count: 20 })).toBe('20 abdos');
  });

  test('exercise types and amounts are validated and the legacy format is accepted', () => {
    const exercise = { id: '1234567890123456', player: second, count: 5, day: '2026-11-04' };
    expect(validateExercise(roster, exercise).type).toBe('pushups');
    for (const type of ['pushups', 'plank', 'crunches'])
      expect(validateExercise(roster, { ...exercise, type }).type).toBe(type);
    const invalid: Record<string, unknown>[] = [
      { type: 'course' },
      { type: null },
      { type: '' },
      { count: Number.POSITIVE_INFINITY },
      { count: Number.NaN },
      { count: '20' },
      { type: 'plank', count: 0 },
      { type: 'plank', count: 0.5 },
      { type: 'plank', count: 60001 },
      { type: 'crunches', count: 1.5 },
      { type: 'crunches', count: 10001 },
    ];
    for (const patch of invalid) expect(() => validateExercise(roster, { ...exercise, ...patch })).toThrow();
  });

  test('once saved, an exercise says what it reduced and what is left', () => {
    expect(exerciseReceipt('alice', { type: 'crunches', count: 20 }, 15, 5)).toBe(
      'Exercice enregistré pour alice : 20 abdos. Dette réduite de 10 pompes, il en reste 5.',
    );
    expect(exerciseReceipt('alice', { type: 'plank', count: 60 }, 5, 0)).toBe(
      'Exercice enregistré pour alice : 1 min de gainage. Dette réduite de 5 pompes, il en reste 0. 10 pompes d’avance pour les prochaines défaites.',
    );
    expect(exerciseReceipt('alice', { type: 'pushups', count: 3 }, 0, 0)).toBe(
      'Exercice enregistré pour alice : 3 pompes. Aucune dette à réduire, il en reste 0. 3 pompes d’avance pour les prochaines défaites.',
    );
    expect(exerciseReceipt('alice', { type: 'pushups', count: 2 }, 0.5, 0)).toBe(
      'Exercice enregistré pour alice : 2 pompes. Dette réduite de 0,5 pompe, il en reste 0. 1,5 pompe d’avance pour les prochaines défaites.',
    );
    // A defeat received while saving shows in what is left, and leaves nothing ahead.
    expect(exerciseReceipt('alice', { type: 'pushups', count: 8 }, 5, 5)).toBe(
      'Exercice enregistré pour alice : 8 pompes. Dette réduite de 5 pompes, il en reste 5.',
    );
  });

  test('an oversized set only announces the debt it really reduces', () => {
    expect(exerciseEffect(5, { type: 'pushups', count: 20 })).toEqual({
      equivalent: 20,
      reduction: 5,
      remaining: 0,
      excess: 15,
    });
    expect(exerciseEffect(0, { type: 'pushups', count: 20 })).toEqual({
      equivalent: 20,
      reduction: 0,
      remaining: 0,
      excess: 20,
    });
    expect(exerciseEffect(5, { type: 'plank', count: 60 })).toEqual({
      equivalent: 15,
      reduction: 5,
      remaining: 0,
      excess: 10,
    });
    expect(exerciseEffect(5, { type: 'crunches', count: 20 })).toEqual({
      equivalent: 10,
      reduction: 5,
      remaining: 0,
      excess: 5,
    });
    expect(exerciseEffect(3.75, { type: 'pushups', count: 5 })).toEqual({
      equivalent: 5,
      reduction: 3.75,
      remaining: 0,
      excess: 1.25,
    });
    expect(exerciseEffect(5, { type: 'pushups', count: 2 })).toEqual({
      equivalent: 2,
      reduction: 2,
      remaining: 3,
      excess: 0,
    });
  });
});

const recapDay = '2026-11-04';
const enabledRule = { enabled: true, effectiveFrom: '2026-11-05', ties: 'none' as const };
const enabledRules = [enabledRule];

function row(matchGuid: string, name: string, score: number, patch: Record<string, unknown> = {}) {
  return {
    match_guid: matchGuid,
    player_id: `Epic|${name}|0`,
    name,
    score,
    day: recapDay,
    kind: 'match',
    team: 0,
    winner: 1,
    received: '2026-11-05T08:00:00Z',
    ...patch,
  };
}

type RecapRow = ReturnType<typeof row>;

function complete(rows: RecapRow[]) {
  return [...new Set(rows.map((r) => r.match_guid))].map((matchGuid) => ({
    match_guid: matchGuid,
    expected_players: rows.filter((r) => r.match_guid === matchGuid).length,
  }));
}

function firstPlayer<T>(players: T[]): T {
  const player = players[0];
  if (!player) throw new Error('expected a roster player');
  return player;
}

describe('daily recap', () => {
  test('matches, losses and the fewest points among the club players of a team', () => {
    const rows = [
      row('loss', first, 50),
      row('loss', second, 100),
      row('loss', third, 300),
      row('loss', 'opponent', 400, { team: 1 }),
      row('win', first, 300, { winner: 0 }),
      row('win', second, 100, { winner: 0 }),
      row('win', 'other', 500, { team: 1, winner: 0 }),
    ];
    const recap = dailyRecap(roster, rows, recapDay, complete(rows));
    expect(recap.matchCount).toBe(2);
    expect(recap.players.map((p) => [p.name, p.played, p.wins, p.losses, p.lowest, p.compared, p.generated])).toEqual([
      [first, 2, 1, 1, 1, 2, 5],
      [second, 2, 1, 1, 1, 2, 5],
      [third, 1, 0, 1, 0, 1, 5],
    ]);
    expect(summarize(roster, rows, [], recapDay, complete(rows)).map((p) => p.due)).toEqual([5, 5, 5]);
  });

  test('the match day wins over a late reception; bots and other days are excluded', () => {
    const rows = [
      row('late', first, 50),
      row('late', second, 100),
      row('late', 'opponent', 300, { team: 1 }),
      row('today', first, 20, { day: '2026-11-05' }),
      row('bot', first, 0, { kind: 'test' }),
    ];
    const recap = dailyRecap(roster, rows, recapDay, complete(rows));
    expect(recap.matchCount).toBe(1);
    expect(firstPlayer(recap.players).played).toBe(1);
    expect(firstPlayer(recap.players).lowest).toBe(1);
    expect(firstPlayer(dailyRecap(roster, rows, '2026-11-05').players).played).toBe(1);
  });

  test('a score update does not create an extra match', () => {
    const rows = [
      row('m', first, 10),
      row('m', second, 100),
      row('m', 'opponent', 300, { team: 1 }),
      row('m', first, 200),
      row('m', second, 100),
    ];
    const rosters = [{ match_guid: 'm', expected_players: 3 }];
    const forward = dailyRecap(roster, rows, recapDay, rosters);
    const backward = dailyRecap(roster, [...rows].reverse(), recapDay, rosters);
    expect(forward).toEqual(backward);
    expect(forward.matchCount).toBe(1);
    expect(forward.players.map((p) => [p.played, p.lowest])).toEqual([
      [1, 0],
      [1, 1],
      [0, 0],
    ]);
  });

  test('opponents never count: the club player with fewer points in the team pays', () => {
    const day = { day: '2026-11-05' };
    const rows = [
      row('m', first, 200, day),
      row('m', second, 300, day),
      row('m', 'opponent-low', 50, { team: 1, ...day }),
      row('m', 'opponent-high', 400, { team: 1, ...day }),
    ];
    const recap = dailyRecap(roster, rows, '2026-11-05', complete(rows), enabledRules);
    expect(recap.players.slice(0, 2).map((p) => [p.lowest, p.bonus, p.generated])).toEqual([
      [1, 5, 10],
      [0, 0, 5],
    ]);
    expect(
      summarize(roster, rows, [], '', complete(rows), enabledRules)
        .slice(0, 2)
        .map((p) => p.due),
    ).toEqual([10, 5]);
  });

  test('a loser with the fewest points of the team takes +5; a winner pays nothing', () => {
    const rows = [row('m', first, 20, { day: '2026-11-05' }), row('m', second, 100, { day: '2026-11-05' })];
    const recap = dailyRecap(roster, rows, '2026-11-05', [], enabledRules);
    expect(firstPlayer(recap.players).generated).toBe(10);
    expect(firstPlayer(recap.players).bonus).toBe(5);
    expect(firstPlayer(summarize(roster, rows, [], '', [], enabledRules)).due).toBe(10);
    const win = rows.map((r) => ({ ...r, winner: 0 }));
    expect(firstPlayer(dailyRecap(roster, win, '2026-11-05', [], enabledRules).players).generated).toBe(0);
  });

  test('a win the opponents forfeited takes 5 off each club player of the team; an unknown clock changes nothing', () => {
    const day = { day: '2026-11-05' };
    const rows = [
      row('ff', first, 300, { ...day, winner: 0, forfeit: true }),
      row('ff', second, 100, { ...day, winner: 0, forfeit: true }),
      row('ff', 'opponent', 50, { ...day, team: 1, winner: 0, forfeit: true }),
      row('loss', first, 200, { ...day, forfeit: false }),
      row('loss', second, 100, { ...day, forfeit: false }),
      row('older', first, 300, { ...day, winner: 0, forfeit: null }),
      row('older', second, 100, { ...day, winner: 0 }),
    ];
    const recap = dailyRecap(roster, rows, '2026-11-05', complete(rows), enabledRules);
    expect(recap.players.slice(0, 2).map((p) => [p.losses, p.bonus, p.dodged, p.generated])).toEqual([
      [1, 0, 5, 0],
      [1, 5, 5, 5],
    ]);
    const [alice, bob] = summarize(roster, rows, [{ player: first, count: 10 }], '', complete(rows), enabledRules);
    expect([alice?.due, alice?.remaining, bob?.due, bob?.remaining]).toEqual([0, 0, 5, 5]);
    // Club players who forfeit lose like any defeat, and a match under review counts nothing.
    const forfeited = rows.slice(0, 3).map((r) => ({ ...r, winner: 1 }));
    expect(firstPlayer(summarize(roster, forfeited, [], '', complete(forfeited))).due).toBe(5);
    const doubtful = rows.slice(0, 3).map((r) => ({ ...r, review_required: true }));
    expect(firstPlayer(summarize(roster, doubtful, [], '', complete(doubtful))).due).toBe(0);
  });

  test('a tie between club players: no extra, or every tied loser pays', () => {
    const rows = [row('m', first, 0, { day: '2026-11-05' }), row('m', second, 0, { day: '2026-11-05' })];
    const none = firstPlayer(dailyRecap(roster, rows, '2026-11-05', [], enabledRules).players);
    const all = firstPlayer(
      dailyRecap(roster, rows, '2026-11-05', [], [{ ...enabledRule, ties: 'all' as const }]).players,
    );
    expect([none.lowest, none.lowestTies, none.generated]).toEqual([1, 1, 5]);
    expect(all.generated).toBe(10);
  });

  test('a club player alone in their team is never compared, 1v1 included', () => {
    const split = [row('m', first, 0, { day: '2026-11-05' }), row('m', second, 100, { team: 1, day: '2026-11-05' })];
    const duel = [row('d', first, 0, { day: '2026-11-05' }), row('d', 'opponent', 100, { team: 1, day: '2026-11-05' })];
    for (const rows of [split, duel]) {
      const player = firstPlayer(dailyRecap(roster, rows, '2026-11-05', complete(rows), enabledRules).players);
      expect([player.lowest, player.compared, player.unranked, player.generated]).toEqual([0, 0, 1, 5]);
    }
  });

  test('the new penalty does not apply before its effective date', () => {
    const rows = [row('m', first, 0), row('m', second, 100)];
    expect(firstPlayer(dailyRecap(roster, rows, recapDay, [], enabledRules).players).generated).toBe(5);
  });

  test('turning the +5 off spares the matches from its day on, and the earlier ones keep it', () => {
    const rules = [enabledRule, { ...enabledRule, effectiveFrom: '2026-11-07', enabled: false }];
    const before = [row('a', first, 0, { day: '2026-11-06' }), row('a', second, 100, { day: '2026-11-06' })];
    const after = [row('b', first, 0, { day: '2026-11-07' }), row('b', second, 100, { day: '2026-11-07' })];
    expect(firstPlayer(dailyRecap(roster, before, '2026-11-06', [], rules).players).generated).toBe(10);
    expect(firstPlayer(dailyRecap(roster, after, '2026-11-07', [], rules).players).generated).toBe(5);
    expect(firstPlayer(summarize(roster, [...before, ...after], [], '', [], rules)).due).toBe(15);
  });

  test('empty day, invalid days and unknown players', () => {
    const recap = dailyRecap(roster, [], recapDay);
    expect(recap.matchCount).toBe(0);
    expect(recap.players.length).toBe(3);
    for (const player of recap.players) {
      for (const value of [
        player.played,
        player.wins,
        player.losses,
        player.lowest,
        player.lowestTies,
        player.compared,
        player.unranked,
        player.generated,
      ]) {
        expect(value).toBe(0);
      }
    }
    for (const invalid of ['', null, '2026-02-31', '2026-1-1']) {
      expect(() => dailyRecap(roster, [], invalid as string)).toThrow();
    }
    expect(dailyRecap(roster, [row('x', 'unknown', 10), row('', first, 10)], recapDay).matchCount).toBe(0);
  });
});

const activities = [
  { type: 'pushups', quarterUnits: 4, counts: [1, 5, 20, 30, 10000], maximum: 10000, total: 'pushups' },
  { type: 'plank', quarterUnits: 1, counts: [1, 15, 20, 60, 120, 60000], maximum: 60000, total: 'plankSeconds' },
  { type: 'crunches', quarterUnits: 2, counts: [1, 10, 20, 60, 10000], maximum: 10000, total: 'crunches' },
] as const;

// The debt a player owes after `remaining` pushups: whole losses, minus a plank baseline that leaves the fraction.
function debtOf(remaining: number) {
  const due = Math.ceil(remaining / 5) * 5;
  const rows = Array.from({ length: due / 5 }, (_, i) => ({
    match_guid: `loss-${i}`,
    player_id: 'player-1',
    name: second,
    day: parisDay(),
    kind: 'match',
    team: 0,
    winner: 1,
    score: 10,
  }));
  const exercises = due > remaining ? [{ player: second, type: 'plank', count: (due - remaining) * 4 }] : [];
  return { rows, exercises };
}

describe('debt regression', () => {
  for (const activity of activities) {
    for (const debt of [0, 0.5, 3.75, 5, 10, 30]) {
      test(`${activity.type}: debt ${debt}, small sets, exact settlement and excess up to the limit`, () => {
        for (const count of activity.counts) {
          const { rows, exercises } = debtOf(debt);
          const before = secondPlayer(summarize(roster, rows, exercises, ''));
          expect(before.remaining).toBe(debt);
          const exercise = validateExercise(roster, {
            id: 'new-exercise-123456',
            player: second,
            type: activity.type,
            count,
            day: parisDay(),
          });
          const equivalent = (count * activity.quarterUnits) / 4;
          const expectedRemaining = equivalent >= debt ? 0 : debt - equivalent;
          const effect = exerciseEffect(debt, exercise);
          expect(effect.remaining).toBe(expectedRemaining);
          expect(effect.reduction >= 0 && effect.reduction <= debt).toBe(true);
          const all = [...exercises, exercise];
          const after = secondPlayer(summarize(roster, rows, all, ''));
          expect(after.remaining).toBe(expectedRemaining);
          expect(after.done).toBe(before.done + equivalent);
          expect(after[activity.total]).toBe(before[activity.total] + count);
          for (const player of summarize(roster, rows, all, ''))
            if (player.name !== second) expect(player.done).toBe(0);
          expect(secondPlayer(summarize(roster, rows, all, '2000-01-01')).remaining).toBe(expectedRemaining);
        }
      });
    }

    test(`${activity.type}: invalid amounts are refused`, () => {
      for (const count of [0, -1, 0.5, null, '20', activity.maximum + 1, Number.MAX_SAFE_INTEGER]) {
        expect(() =>
          validateExercise(roster, {
            id: 'new-exercise-123456',
            player: second,
            type: activity.type,
            count,
            day: parisDay(),
          }),
        ).toThrow('Déclaration invalide.');
      }
    });
  }

  test('two different sets of the same amount stay two efforts', () => {
    const { rows, exercises } = debtOf(5);
    const sets = ['first-exercise-123456', 'second-exercise-123456'].map((id) =>
      validateExercise(roster, { id, player: second, type: 'pushups', count: 20, day: parisDay() }),
    );
    const summary = secondPlayer(summarize(roster, rows, [...exercises, ...sets], ''));
    expect([summary.remaining, summary.pushups]).toEqual([0, 40]);
  });

  test('plank and crunches mixed with pushups: exact settlement then excess', () => {
    const { rows } = debtOf(30);
    const exercises: { player: string; type: string; count: number }[] = [];
    const steps: [string, number, number][] = [
      ['plank', 60, 15],
      ['crunches', 20, 5],
      ['pushups', 5, 0],
      ['pushups', 20, 0],
    ];
    for (const [type, count, remaining] of steps) {
      exercises.push({ player: second, type, count });
      expect(secondPlayer(summarize(roster, rows, exercises, '')).remaining).toBe(remaining);
    }
    const summary = secondPlayer(summarize(roster, rows, exercises, ''));
    expect([summary.pushups, summary.plankSeconds, summary.crunches]).toEqual([25, 60, 20]);
  });

  test('a legacy client without a type declares pushups', () => {
    const exercise = validateExercise(roster, {
      id: 'new-exercise-123456',
      player: second,
      count: 20,
      day: parisDay(),
    });
    expect(exercise.type).toBe('pushups');
    const { rows, exercises } = debtOf(5);
    const summary = secondPlayer(summarize(roster, rows, [...exercises, exercise], ''));
    expect([summary.remaining, summary.pushups]).toEqual([0, 20]);
  });
});
