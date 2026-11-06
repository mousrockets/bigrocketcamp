import { Hono } from 'hono';
import { readRankTargets, recordObservedRanks, targetRanks } from '../../lib/rank-source';
import { secretKeyMatches } from '../../lib/secret-key';
import type { AppEnv } from '../auth';
import { invalidRanks, observedRanks } from '../inputs';
import { failure, noStore } from '../respond';
import { jsonBody } from '../validate';

// For the instance's rank source only, authenticated by its own key (X-Rank-Source-Key).
export const rankRoutes = new Hono<AppEnv>();

rankRoutes.use(async (c, next) => {
  if (!secretKeyMatches(c.env.RANK_SOURCE_KEY, c.req.header('X-Rank-Source-Key'))) {
    return c.json({ error: 'Source de rangs non autorisée.' }, 401, noStore);
  }
  await next();
});

rankRoutes.get('/targets', async (c) => c.json({ targets: await readRankTargets(c.env.DB) }, 200, noStore));

const ranksBody = jsonBody(observedRanks, {
  invalid: invalidRanks,
  maxLength: 20_000,
  tooLarge: 'Envoi trop volumineux.',
});

rankRoutes.post('/', ...ranksBody, async (c) => {
  try {
    const ranks = targetRanks(c.req.valid('json').ranks, await readRankTargets(c.env.DB));
    return c.json({ ok: true, ...(await recordObservedRanks(c.env.DB, ranks)) }, 200, noStore);
  } catch (error) {
    return failure(c, error, invalidRanks);
  }
});
