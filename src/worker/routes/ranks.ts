import { Hono } from 'hono';
import { readRankTargets, recordObservedRanks, validateObservedRanks } from '../../lib/rank-source';
import { secretKeyMatches } from '../../lib/secret-key';
import type { AppEnv } from '../auth';

// For the instance's rank source only, authenticated by its own key (X-Rank-Source-Key).
export const rankRoutes = new Hono<AppEnv>();

const noStore = { 'Cache-Control': 'no-store' };

rankRoutes.use(async (c, next) => {
  if (!secretKeyMatches(c.env.RANK_SOURCE_KEY, c.req.header('X-Rank-Source-Key'))) {
    return c.json({ error: 'Source de rangs non autorisée.' }, 401, noStore);
  }
  await next();
});

rankRoutes.get('/targets', async (c) => c.json({ targets: await readRankTargets(c.env.DB) }, 200, noStore));

rankRoutes.post('/', async (c) => {
  const body = await c.req.text();
  if (body.length > 20_000) return c.json({ error: 'Envoi trop volumineux.' }, 413, noStore);
  try {
    const ranks = validateObservedRanks(JSON.parse(body).ranks, await readRankTargets(c.env.DB));
    return c.json({ ok: true, ...(await recordObservedRanks(c.env.DB, ranks)) }, 200, noStore);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Relevé de rangs invalide.' }, 400, noStore);
  }
});
