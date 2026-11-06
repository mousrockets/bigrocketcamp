import { Hono } from 'hono';
import { readRoster } from '../../lib/club';
import { parseLiveMatch } from '../../lib/live-stats';
import { buildMatches } from '../../lib/match-builds';
import {
  attributeLivePlayers,
  canonicalPlayerId,
  readIdentityBindings,
  readPlayerIdentities,
} from '../../lib/player-identities';
import { matchKey, observationWrites } from '../../lib/reconcile';
import { type AppEnv, sameOrigin } from '../auth';
import { failure } from '../respond';

export const liveRoutes = new Hono<AppEnv>();

const noStore = { 'Cache-Control': 'no-store' };

/** A stable, anonymous source name per member: observations from two PCs stay distinguishable. */
async function sourceOf(memberId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(memberId));
  return `live-${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)}`;
}

liveRoutes.get('/', async (c) => {
  const accounts = await readPlayerIdentities(c.env.DB, await readRoster(c.env.DB), c.var.member.id);
  return c.json({ players: accounts.map((account) => account.slot) }, 200, noStore);
});

liveRoutes.post('/', async (c) => {
  // A paired collector is a native client, without an Origin; the browser must come from the app's own pages.
  if (!c.var.collector && !sameOrigin(c)) return c.json({ error: 'Origine refusée.' }, 403, noStore);
  const body = await c.req.text();
  if (body.length > 64000) return c.json({ error: 'Envoi trop volumineux.' }, 413, noStore);
  const db = c.env.DB;
  const memberId = c.var.member.id;
  try {
    const roster = await readRoster(db);
    const parsed = parseLiveMatch(roster, JSON.parse(body));
    const [accounts, bindings] = await Promise.all([
      readPlayerIdentities(db, roster, memberId),
      readIdentityBindings(db, roster),
    ]);
    const containsOwnPlayer = parsed.rows.some((row) =>
      bindings.some(
        (binding) =>
          accounts.some((account) => account.slot === binding.slot) &&
          canonicalPlayerId(row.playerId) === canonicalPlayerId(binding.player_id),
      ),
    );
    if (!containsOwnPlayer) {
      return c.json(
        { error: 'Le tableau doit contenir ton propre identifiant de joueur enregistré dans RL-Pompes.' },
        403,
        noStore,
      );
    }
    const rows = attributeLivePlayers(roster, parsed.rows, bindings);
    const now = new Date().toISOString();
    const sourceId = await sourceOf(memberId);
    const writes = await observationWrites(
      db,
      { rows, rosters: parsed.rosters, sourceId, sourceType: 'collector' },
      now,
    );
    writes.push(
      db
        .prepare(
          'INSERT INTO collectors (id, last_seen) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen',
        )
        .bind(sourceId, now),
    );
    await db.batch(writes as D1PreparedStatement[]);
    // The board shows the match as soon as it is rebuilt; a match another collector is sending at the same
    // moment is rebuilt by whichever lands last, or by the next board that opens.
    // The match is stored either way: a build that fails here is done by the next board that asks.
    const guids = [...new Set(rows.map((row) => matchKey(row.matchGuid)))];
    try {
      for (let attempt = 0; attempt < 3 && guids.length; attempt++) {
        const built = new Set(await buildMatches(db, roster, bindings, guids));
        guids.splice(0, guids.length, ...guids.filter((guid) => !built.has(guid)));
      }
    } catch (error) {
      console.error('match build deferred', error instanceof Error ? error.name : 'unknown');
    }
    return c.json({ ok: true, match: rows[0]?.matchGuid, received: rows.length }, 200, noStore);
  } catch (error) {
    return failure(c, error, 'Envoi invalide.');
  }
});
