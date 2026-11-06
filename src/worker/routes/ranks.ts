import { Hono } from 'hono';
import { readLastRankedMatch, readRankTargets, recordObservedRanks, targetRanks } from '../../lib/rank-source';
import { secretKeyMatches } from '../../lib/secret-key';
import type { AppEnv } from '../auth';
import { invalidRanks, rankReport } from '../inputs';
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

// The time of the last ranked match also tells a source that this app gives it, and that it may ask /activity.
rankRoutes.get('/targets', async (c) => {
  const [targets, lastRankedMatchAt] = await Promise.all([readRankTargets(c.env.DB), readLastRankedMatch(c.env.DB)]);
  return c.json({ targets, lastRankedMatchAt }, 200, noStore);
});

rankRoutes.get('/activity', async (c) =>
  c.json({ lastRankedMatchAt: await readLastRankedMatch(c.env.DB) }, 200, noStore),
);

const reportBody = jsonBody(rankReport, {
  invalid: invalidRanks,
  maxLength: 20_000,
  tooLarge: 'Envoi trop volumineux.',
});

rankRoutes.post('/', ...reportBody, async (c) => {
  try {
    const targets = await readRankTargets(c.env.DB);
    const report = targetRanks(c.req.valid('json'), targets);
    return c.json({ ok: true, ...(await recordObservedRanks(c.env.DB, report, targets)) }, 200, noStore);
  } catch (error) {
    return failure(c, error, invalidRanks);
  }
});
