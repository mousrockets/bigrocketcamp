import { Hono } from 'hono';
import { readClubPlayers, rosterOf } from '../../lib/club';
import type { SeasonMmrList } from '../../lib/contract';
import { readSeasonMmr } from '../../lib/season-mmr';
import type { AppEnv } from '../auth';
import { noStore } from '../respond';

// What only the Stats page reads, when it opens: it goes through the whole rating history, which the board, read on
// every change, cannot afford.
export const statsRoutes = new Hono<AppEnv>().get('/seasons', async (c) => {
  const seasons = await readSeasonMmr(c.env.DB, rosterOf(await readClubPlayers(c.env.DB)));
  return c.json({ seasons } satisfies SeasonMmrList, 200, noStore);
});
