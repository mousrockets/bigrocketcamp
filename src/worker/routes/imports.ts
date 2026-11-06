import { Hono } from 'hono';
import { readClubPlayers, readRoster } from '../../lib/club';
import { normalizeParticipant, type RawResult, validateExercise } from '../../lib/domain';
import { validateMatchRosters } from '../../lib/match-rules';
import { publicMmrKeyMatches } from '../../lib/public-mmr-auth';
import { importPublicMmr } from '../../lib/public-ranks';
import { observationWrites } from '../../lib/reconcile';
import type { AppEnv } from '../auth';

// Machine-to-machine imports, authenticated by their own secret instead of a member session.
export const importRoutes = new Hono<AppEnv>();

/** Compares fixed-length digests, so the response time never reveals how much of the key matched. */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all(
    [a, b].map((text) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))),
  );
  const left = new Uint8Array(x as ArrayBuffer);
  const right = new Uint8Array(y as ArrayBuffer);
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

importRoutes.post('/ingest', async (c) => {
  const secret = c.env.INGEST_KEY;
  if (!secret || !(await sameSecret(c.req.header('authorization') ?? '', `Bearer ${secret}`))) {
    return c.json({ error: 'Collecteur non autorisé.' }, 401);
  }
  const body = await c.req.text();
  if (body.length > 2_000_000) return c.json({ error: 'Envoi trop volumineux.' }, 413);
  try {
    const data = JSON.parse(body);
    if (
      !Array.isArray(data.results) ||
      data.results.length > 500 ||
      !Array.isArray(data.exercises) ||
      data.exercises.length > 500 ||
      typeof data.collector !== 'string' ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(data.collector)
    ) {
      throw new Error('Envoi invalide.');
    }
    const roster = await readRoster(c.env.DB);
    const rows = data.results.map((result: RawResult) => normalizeParticipant(roster, result));
    const rosters = validateMatchRosters(data.matches, rows);
    const exercises = data.exercises.map((exercise: unknown) => validateExercise(roster, exercise));
    const now = new Date().toISOString();
    const db = c.env.DB;
    // Rows saved before observations existed are kept as the "legacy" source, so reconciliation still sees them.
    const writes = rows.map((row: { matchGuid: string; playerId: string }) =>
      db
        .prepare(
          "INSERT INTO result_observations (id, match_guid, player_id, source_id, source_type, payload, received) SELECT 'legacy:' || match_guid || ':' || player_id, match_guid, player_id, 'legacy', 'collector', json_object('match_guid', match_guid, 'player_id', player_id, 'name', name, 'day', day, 'kind', kind, 'team', team, 'winner', winner, 'score', score, 'goals', goals, 'assists', assists, 'saves', saves), received FROM results WHERE match_guid = ? AND player_id = ? ON CONFLICT(id) DO NOTHING",
        )
        .bind(row.matchGuid, row.playerId),
    );
    writes.push(
      ...(await observationWrites(db, { rows, rosters, sourceId: data.collector, sourceType: 'collector' }, now)),
    );
    for (const row of rows) {
      writes.push(
        db
          .prepare(
            "INSERT INTO results (match_guid, player_id, name, day, kind, team, winner, score, goals, assists, saves, received) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(match_guid, player_id) DO UPDATE SET name = excluded.name, day = excluded.day, kind = excluded.kind, team = excluded.team, winner = excluded.winner, score = excluded.score, goals = excluded.goals, assists = excluded.assists, saves = excluded.saves, received = excluded.received WHERE (excluded.kind = 'match' AND results.kind = 'test') OR (excluded.kind = results.kind AND excluded.score >= results.score)",
          )
          .bind(
            row.matchGuid,
            row.playerId,
            row.name,
            row.day,
            row.kind,
            row.team,
            row.winner,
            row.score,
            row.goals,
            row.assists,
            row.saves,
            now,
          ),
      );
    }
    for (const roster of rosters) {
      writes.push(
        db
          .prepare(
            'INSERT INTO match_rosters (match_guid, expected_players, received) VALUES (?, ?, ?) ON CONFLICT(match_guid) DO UPDATE SET expected_players = excluded.expected_players, received = excluded.received',
          )
          .bind(roster.matchGuid, roster.playerCount, now),
      );
    }
    for (const exercise of exercises) {
      writes.push(
        db
          .prepare(
            'INSERT INTO exercises (id, player, count, day, created, author, type) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
          )
          .bind(exercise.id, exercise.player, exercise.count, exercise.day, now, 'import-local', exercise.type),
      );
    }
    writes.push(
      db
        .prepare(
          'INSERT INTO collectors (id, last_seen) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen',
        )
        .bind(data.collector, now),
    );
    await db.batch(writes);
    return c.json({ ok: true, received: rows.length });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Envoi invalide.' }, 400);
  }
});

importRoutes.post('/public-mmr', async (c) => {
  const noStore = { 'Cache-Control': 'no-store' };
  if (!publicMmrKeyMatches(c.env.PUBLIC_MMR_IMPORT_KEY, c.req.header('X-RL-Public-Mmr-Key'))) {
    return c.json({ error: 'Accès au relevé refusé.' }, 401, noStore);
  }
  const body = await c.req.text();
  if (body.length > 1_550_000) return c.json({ error: 'Envoi trop volumineux.' }, 413, noStore);
  try {
    return c.json(
      await importPublicMmr(c.env.DB, await readClubPlayers(c.env.DB), JSON.parse(body).pages),
      200,
      noStore,
    );
  } catch {
    return c.json({ error: 'Envoi de profils publics invalide.' }, 400, noStore);
  }
});
