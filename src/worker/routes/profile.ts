import { Hono } from 'hono';
import { deleteOwnAccount, readOwnProfile, saveOwnProfile } from '../../lib/members';
import { type AppEnv, clearSessionCookie, sameOrigin } from '../auth';
import { failure, noStore, smallJson } from '../respond';

/** Each member fills in their own profile, and can delete their own account. */
export const profileRoutes = new Hono<AppEnv>();

profileRoutes.get('/', async (c) => c.json(await readOwnProfile(c.env.DB, c.var.member.id), 200, noStore));

profileRoutes.put('/', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'Origine refusée.' }, 403, noStore);
  try {
    return c.json(await saveOwnProfile(c.env.DB, c.var.member.id, await smallJson(c)), 200, noStore);
  } catch (error) {
    return failure(c, error, 'Profil invalide.');
  }
});

profileRoutes.delete('/', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'Origine refusée.' }, 403, noStore);
  try {
    await deleteOwnAccount(c.env.DB, c.var.member.id);
    clearSessionCookie(c);
    return c.body(null, 204);
  } catch (error) {
    return failure(c, error, 'Suppression impossible.');
  }
});
