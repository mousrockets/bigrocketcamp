import { Hono } from 'hono';
import { readRoster } from '../../lib/club';
import { type Done, invalidTournamentWin, tournamentWin } from '../../lib/contract';
import { cancelTournamentWin, declareTournamentWin } from '../../lib/tournament-wins';
import { type AppEnv, sameOriginOnly } from '../auth';
import { failure, noStore } from '../respond';
import { jsonBody } from '../validate';

/** Any member declares a tournament the club won, on its last match, or takes it back. */
export const tournamentWinRoutes = new Hono<AppEnv>()
  .use(sameOriginOnly)
  .post('/', ...jsonBody(tournamentWin, { invalid: invalidTournamentWin }), async (c) => {
    try {
      const db = c.env.DB;
      await declareTournamentWin(db, await readRoster(db), c.req.valid('json').matchGuid);
      return c.json({ ok: true } satisfies Done, 200, noStore);
    } catch (error) {
      return failure(c, error, invalidTournamentWin);
    }
  })
  .delete('/', ...jsonBody(tournamentWin, { invalid: invalidTournamentWin }), async (c) => {
    await cancelTournamentWin(c.env.DB, c.req.valid('json').matchGuid);
    return c.json({ ok: true } satisfies Done, 200, noStore);
  });
