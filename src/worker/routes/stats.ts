import { Hono } from 'hono';
import { readClubPlayers, rosterOf } from '../../lib/club';
import type { SeasonMmrList } from '../../lib/contract';
import { orm } from '../../lib/orm';
import { statfeedLabels } from '../../lib/schema';
import { readSeasonMmr } from '../../lib/season-mmr';
import type { AppEnv } from '../auth';
import { noStore } from '../respond';

// What only the Stats page reads, when it opens: it goes through the whole rating history, which the board, read on
// every change, cannot afford.
export const statsRoutes = new Hono<AppEnv>().get('/seasons', async (c) => {
  const [seasons, labels] = await Promise.all([
    readClubPlayers(c.env.DB).then((players) => readSeasonMmr(c.env.DB, rosterOf(players))),
    orm(c.env.DB).select({ name: statfeedLabels.name, label: statfeedLabels.label }).from(statfeedLabels),
  ]);
  const body: SeasonMmrList = {
    seasons,
    statfeedLabels: Object.fromEntries(labels.map(({ name, label }) => [name, label])),
  };
  return c.json(body, 200, noStore);
});
