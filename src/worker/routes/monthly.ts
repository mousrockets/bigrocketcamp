import { Hono } from 'hono';
import { readClubPlayers, readRoster } from '../../lib/club';
import { closeMonthlyMmr, readMonthlyMmr, settleDrink } from '../../lib/monthly-mmr';
import { type AppEnv, sameOriginOnly } from '../auth';
import { monthlyAction, unknownAction } from '../inputs';
import { failure, noStore } from '../respond';
import { jsonBody } from '../validate';

export const monthlyRoutes = new Hono<AppEnv>();

monthlyRoutes.get('/', async (c) =>
  c.json(await readMonthlyMmr(c.env.DB, await readClubPlayers(c.env.DB), c.var.member.id), 200, noStore),
);

const monthlyBody = jsonBody(monthlyAction, {
  invalid: unknownAction,
  maxLength: 3000,
  tooLarge: 'Envoi trop volumineux.',
});

monthlyRoutes.post('/', sameOriginOnly, ...monthlyBody, async (c) => {
  const db = c.env.DB;
  const input = c.req.valid('json');
  try {
    const roster = await readRoster(db);
    if (input.action === 'refresh') return c.json(await closeMonthlyMmr(db, roster), 200, noStore);
    return c.json(await settleDrink(db, roster, c.var.member.id, input.id, input.action === 'undo'), 200, noStore);
  } catch (error) {
    return failure(c, error, 'Action impossible.');
  }
});
