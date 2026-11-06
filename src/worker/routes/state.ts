import { Hono } from 'hono';
import { readClubPlayers, rosterOf } from '../../lib/club';
import { readDoublesRanks } from '../../lib/doubles-ranks';
import { readMonthlyMmr } from '../../lib/monthly-mmr';
import { readRankSourceHealth } from '../../lib/rank-source';
import { readMerged } from '../../lib/reconcile';
import type { AppEnv } from '../auth';

export const stateRoutes = new Hono<AppEnv>();

stateRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const memberId = c.var.member.id;
  const players = await readClubPlayers(db);
  const roster = rosterOf(players);
  const [merged, exercises, collectors, doublesRanks, reactions, me, monthly, rankSource] = await Promise.all([
    readMerged(db, roster),
    db.prepare('SELECT * FROM exercises ORDER BY created DESC').all<Record<string, unknown>>(),
    db.prepare('SELECT * FROM collectors ORDER BY last_seen DESC').all(),
    readDoublesRanks(db, roster),
    db
      .prepare(
        'SELECT exercise_id, emoji, COUNT(*) AS count, MAX(author = ?) AS mine FROM exercise_reactions GROUP BY exercise_id, emoji',
      )
      .bind(memberId)
      .all(),
    db
      .prepare(
        'SELECT player FROM exercises WHERE author = ? GROUP BY player ORDER BY COUNT(*) DESC, MAX(created) DESC LIMIT 1',
      )
      .bind(memberId)
      .first<{ player: string }>(),
    readMonthlyMmr(db, players, memberId),
    // Only an instance with a rank source can see it stop.
    c.env.RANK_SOURCE_KEY ? readRankSourceHealth(db) : null,
  ]);
  // Authors stay private: a member only learns which exercises are theirs.
  const ownExercises = exercises.results.map(({ author, ...exercise }) => ({ ...exercise, mine: author === memberId }));
  const body = JSON.stringify({
    results: merged.rows,
    exercises: ownExercises,
    collectors: collectors.results,
    matchRosters: merged.rosters,
    reliability: merged.reliability,
    doublesRanks,
    reactions: reactions.results,
    me: me?.player ?? null,
    monthly,
    rankSource,
  });
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)));
  const etag = `"${Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('')}"`;
  // Revalidated on every poll: an unchanged state costs an empty 304.
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-cache', ETag: etag };
  if (c.req.header('if-none-match') === etag) return new Response(null, { status: 304, headers });
  return new Response(body, { headers });
});
