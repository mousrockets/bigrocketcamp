import { Hono } from 'hono';
import { invalidRanks, type RankActivity, type RanksRecorded, type RankTargets, rankReport } from '../../lib/contract';
import {
  readLastRankedMatch,
  readRankSourceHealth,
  readRankTargets,
  recordObservedRanks,
  targetRanks,
} from '../../lib/rank-source';
import { secretKeyMatches } from '../../lib/secret-key';
import type { AppEnv } from '../auth';
import { failure, noStore } from '../respond';
import { jsonBody } from '../validate';

const reportBody = jsonBody(rankReport, {
  invalid: invalidRanks,
  maxLength: 20_000,
  tooLarge: 'Envoi trop volumineux.',
});

// For the instance's rank source only, authenticated by its own key (X-Rank-Source-Key).
export const rankRoutes = new Hono<AppEnv>()
  .use(async (c, next) => {
    if (!secretKeyMatches(c.env.RANK_SOURCE_KEY, c.req.header('X-Rank-Source-Key'))) {
      return c.json({ error: 'Source de rangs non autorisée.' }, 401, noStore);
    }
    await next();
  })
  // The time of the last ranked match also tells a source that this app gives it, and that it may ask /activity.
  .get('/targets', async (c) => {
    const [targets, lastRankedMatchAt] = await Promise.all([readRankTargets(c.env.DB), readLastRankedMatch(c.env.DB)]);
    return c.json({ targets, lastRankedMatchAt } satisfies RankTargets, 200, noStore);
  })
  // The last reading too, from the database: a source that keeps its schedule in an eventually consistent store
  // can tell from it that a reading already happened.
  .get('/activity', async (c) => {
    const [lastRankedMatchAt, health] = await Promise.all([
      readLastRankedMatch(c.env.DB),
      readRankSourceHealth(c.env.DB),
    ]);
    return c.json({ lastRankedMatchAt, lastReadAt: health.lastReadAt } satisfies RankActivity, 200, noStore);
  })
  .post('/', ...reportBody, async (c) => {
    try {
      const targets = await readRankTargets(c.env.DB);
      const report = targetRanks(c.req.valid('json'), targets);
      const recorded = await recordObservedRanks(c.env.DB, report, targets);
      return c.json({ ok: true, ...recorded } satisfies RanksRecorded, 200, noStore);
    } catch (error) {
      return failure(c, error, invalidRanks);
    }
  });
