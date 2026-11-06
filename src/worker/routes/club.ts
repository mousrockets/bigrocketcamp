import { Hono } from 'hono';
import { readClubName, readClubPlayers } from '../../lib/club';
import { readOwnProfile, saveClubName } from '../../lib/members';
import { type AppEnv, requireAdmin, sameOriginOnly } from '../auth';
import { clubName, invalidClubName } from '../inputs';
import { noStore } from '../respond';
import { jsonBody } from '../validate';

/** Before signing in, a visitor only learns the club's name. */
export const clubNameRoutes = new Hono<AppEnv>();

clubNameRoutes.get('/', async (c) => c.json({ name: await readClubName(c.env.DB) }, 200, noStore));

/** The club as a signed-in member sees it: its name, its players and their own profile. */
export const clubRoutes = new Hono<AppEnv>();

clubRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const [name, players, me] = await Promise.all([
    readClubName(db),
    readClubPlayers(db),
    readOwnProfile(db, c.var.member.id),
  ]);
  return c.json({ name, players, me }, 200, noStore);
});

clubRoutes.put('/', requireAdmin, sameOriginOnly, ...jsonBody(clubName, { invalid: invalidClubName }), async (c) =>
  c.json({ name: await saveClubName(c.env.DB, c.req.valid('json').name) }, 200, noStore),
);
