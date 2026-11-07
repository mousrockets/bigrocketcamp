import { Hono } from 'hono';
import { readRoster } from '../../lib/club';
import { invalidLiveMatch, type LivePlayers, type LiveReceived, livePayloadInput } from '../../lib/contract';
import { isLeft, isRankedDoubles, livePayloadRows } from '../../lib/live-stats';
import { buildMatches } from '../../lib/match-builds';
import {
  attributeLivePlayers,
  canonicalPlayerId,
  readIdentityBindings,
  readPlayerIdentities,
  unassignedPrefix,
} from '../../lib/player-identities';
import { matchKey, observationWrites } from '../../lib/reconcile';
import { type AppEnv, sameOrigin } from '../auth';
import { failure } from '../respond';
import { jsonBody } from '../validate';

const noStore = { 'Cache-Control': 'no-store' };

/** A stable, anonymous source name per member: observations from two PCs stay distinguishable. */
async function sourceOf(memberId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(memberId));
  return `live-${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)}`;
}

const liveBody = jsonBody(livePayloadInput(), {
  invalid: invalidLiveMatch,
  maxLength: 64_000,
  tooLarge: 'Envoi trop volumineux.',
});

export const liveRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const accounts = await readPlayerIdentities(c.env.DB, await readRoster(c.env.DB), c.var.member.id);
    return c.json({ players: accounts.map((account) => account.slot) } satisfies LivePlayers, 200, noStore);
  })
  .post(
    '/',
    async (c, next) => {
      // A paired collector is a native client, without an Origin; the browser must come from the app's own pages.
      if (!c.var.collector && !sameOrigin(c)) return c.json({ error: 'Origine refusée.' }, 403, noStore);
      await next();
    },
    ...liveBody,
    async (c) => {
      const db = c.env.DB;
      const memberId = c.var.member.id;
      try {
        const roster = await readRoster(db);
        const match = c.req.valid('json');
        const left = isLeft(match);
        const parsed = livePayloadRows(roster, match);
        const [accounts, bindings] = await Promise.all([
          readPlayerIdentities(db, roster, memberId),
          readIdentityBindings(db, roster),
        ]);
        const isOwnPlayer = (row: { playerId: string }) =>
          bindings.some(
            (binding) =>
              accounts.some((account) => account.slot === binding.slot) &&
              canonicalPlayerId(row.playerId) === canonicalPlayerId(binding.player_id),
          );
        if (!parsed.rows.some(isOwnPlayer)) {
          return c.json(
            { error: 'Le tableau doit contenir ton propre identifiant de joueur enregistré dans RL-Pompes.' },
            403,
            noStore,
          );
        }
        // A match left holds no result: its sender's departure alone is recorded, the match was not over for the
        // others. A finished match keeps the departures of club players only; nobody else's counts.
        const rows = left ? [] : attributeLivePlayers(roster, parsed.rows, bindings);
        const departures = attributeLivePlayers(roster, parsed.departures, bindings).filter((row) =>
          left ? isOwnPlayer(row) : roster.includes(row.name) || row.name.startsWith(unassignedPrefix),
        );
        const now = new Date().toISOString();
        const sourceId = await sourceOf(memberId);
        const writes = await observationWrites(
          db,
          { rows, rosters: parsed.rosters, departures, sourceId, sourceType: 'collector' },
          now,
        );
        writes.push(
          db
            .prepare(
              `INSERT INTO collectors (id, last_seen, last_ranked_at) VALUES (?1, ?2, ?3)
              ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen,
                last_ranked_at = COALESCE(excluded.last_ranked_at, collectors.last_ranked_at)`,
            )
            .bind(sourceId, now, isRankedDoubles(match) ? now : null),
        );
        await db.batch(writes as D1PreparedStatement[]);
        // The board shows the match as soon as it is rebuilt; a match another collector is sending at the same
        // moment is rebuilt by whichever lands last, or by the next board that opens.
        // The match is stored either way: a build that fails here is done by the next board that asks.
        const guids = [...new Set([...rows, ...departures].map((row) => matchKey(row.matchGuid)))];
        try {
          for (let attempt = 0; attempt < 3 && guids.length; attempt++) {
            const built = new Set(await buildMatches(db, roster, bindings, guids));
            guids.splice(0, guids.length, ...guids.filter((guid) => !built.has(guid)));
          }
        } catch (error) {
          console.error('match build deferred', error instanceof Error ? error.name : 'unknown');
        }
        const received: LiveReceived = {
          ok: true,
          match: matchKey(match.state.MatchGuid),
          received: left ? departures.length : rows.length,
        };
        return c.json(received, 200, noStore);
      } catch (error) {
        return failure(c, error, invalidLiveMatch);
      }
    },
  );
