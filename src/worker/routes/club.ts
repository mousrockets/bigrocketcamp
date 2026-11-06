import { Hono } from 'hono';
import { readClubName, readClubPlayers } from '../../lib/club';
import { readOwnProfile, saveClubName } from '../../lib/members';
import { type AppEnv, requireAdmin, sameOrigin } from '../auth';
import { failure, noStore, smallJson } from '../respond';

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

clubRoutes.put('/', requireAdmin, async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'Origine refusée.' }, 403, noStore);
  try {
    return c.json({ name: await saveClubName(c.env.DB, (await smallJson(c))?.name) }, 200, noStore);
  } catch (error) {
    return failure(c, error, 'Nom du club invalide.');
  }
});
