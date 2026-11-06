import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { closeMonthlyMmr, readMonthlyMmr, recordMmr, settleDrink } from '../../lib/monthly-mmr';
import { type AppEnv, sameOrigin } from '../auth';

export const monthlyRoutes = new Hono<AppEnv>();

const noStore = { 'Cache-Control': 'no-store' };

monthlyRoutes.get('/', async (c) => c.json(await readMonthlyMmr(c.env.DB, c.var.member.id), 200, noStore));

monthlyRoutes.post('/', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'Origine refusée.' }, 403, noStore);
  const body = await c.req.text();
  if (body.length > 3000) return c.json({ error: 'Envoi trop volumineux.' }, 413, noStore);
  const db = c.env.DB;
  const memberId = c.var.member.id;
  try {
    const input = JSON.parse(body);
    if (input.action === 'record') return c.json(await recordMmr(db, memberId, input), 200, noStore);
    if (input.action === 'refresh') return c.json(await closeMonthlyMmr(db), 200, noStore);
    if (input.action === 'settle' || input.action === 'undo') {
      return c.json(await settleDrink(db, memberId, input.id, input.action === 'undo'), 200, noStore);
    }
    throw new Error('Action inconnue.');
  } catch (error) {
    const status = ((error as { status?: number } | null)?.status ?? 400) as ContentfulStatusCode;
    return c.json({ error: error instanceof Error ? error.message : 'Action impossible.' }, status, noStore);
  }
});
