import { Hono } from 'hono';
import { readClubPlayers, readRoster } from '../../lib/club';
import { closeMonthlyMmr, readMonthlyMmr, settleDrink } from '../../lib/monthly-mmr';
import { type AppEnv, sameOrigin } from '../auth';
import { failure } from '../respond';

export const monthlyRoutes = new Hono<AppEnv>();

const noStore = { 'Cache-Control': 'no-store' };

monthlyRoutes.get('/', async (c) =>
  c.json(await readMonthlyMmr(c.env.DB, await readClubPlayers(c.env.DB), c.var.member.id), 200, noStore),
);

monthlyRoutes.post('/', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'Origine refusée.' }, 403, noStore);
  const body = await c.req.text();
  if (body.length > 3000) return c.json({ error: 'Envoi trop volumineux.' }, 413, noStore);
  const db = c.env.DB;
  const memberId = c.var.member.id;
  try {
    const input = JSON.parse(body);
    const roster = await readRoster(db);
    if (input.action === 'refresh') return c.json(await closeMonthlyMmr(db, roster), 200, noStore);
    if (input.action === 'settle' || input.action === 'undo') {
      return c.json(await settleDrink(db, roster, memberId, input.id, input.action === 'undo'), 200, noStore);
    }
    throw new Error('Action inconnue.');
  } catch (error) {
    return failure(c, error, 'Action impossible.');
  }
});
