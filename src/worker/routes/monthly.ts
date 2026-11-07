import { Hono } from 'hono';
import { readClubPlayers, readRoster } from '../../lib/club';
import { type Done, type MonthlyStandings, type MonthsClosed, monthlyAction, unknownAction } from '../../lib/contract';
import { closeMonthlyMmr, readMonthlyMmr, settleDrink } from '../../lib/monthly-mmr';
import { type AppEnv, sameOriginOnly } from '../auth';
import { failure, noStore } from '../respond';
import { jsonBody } from '../validate';

const monthlyBody = jsonBody(monthlyAction, {
  invalid: unknownAction,
  maxLength: 3000,
  tooLarge: 'Envoi trop volumineux.',
});

export const monthlyRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const standings: MonthlyStandings = await readMonthlyMmr(
      c.env.DB,
      await readClubPlayers(c.env.DB),
      c.var.member.id,
    );
    return c.json(standings, 200, noStore);
  })
  .post('/', sameOriginOnly, ...monthlyBody, async (c) => {
    const db = c.env.DB;
    const input = c.req.valid('json');
    try {
      const roster = await readRoster(db);
      if (input.action === 'refresh') {
        const closed: MonthsClosed = await closeMonthlyMmr(db, roster);
        return c.json(closed, 200, noStore);
      }
      const settled: Done = await settleDrink(db, roster, c.var.member.id, input.id, input.action === 'undo');
      return c.json(settled, 200, noStore);
    } catch (error) {
      return failure(c, error, 'Action impossible.');
    }
  });
