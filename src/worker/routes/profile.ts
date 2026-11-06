import { Hono } from 'hono';
import { deleteOwnAccount, readOwnProfile, saveOwnProfile } from '../../lib/members';
import { type AppEnv, clearSessionCookie, sameOriginOnly } from '../auth';
import { invalidDuoPseudo, profile } from '../inputs';
import { failure, noStore } from '../respond';
import { jsonBody } from '../validate';

/** Each member fills in their own profile, and can delete their own account. */
export const profileRoutes = new Hono<AppEnv>();

profileRoutes.get('/', async (c) => c.json(await readOwnProfile(c.env.DB, c.var.member.id), 200, noStore));

profileRoutes.put('/', sameOriginOnly, ...jsonBody(profile, { invalid: invalidDuoPseudo }), async (c) => {
  try {
    return c.json(await saveOwnProfile(c.env.DB, c.var.member.id, c.req.valid('json')), 200, noStore);
  } catch (error) {
    return failure(c, error, 'Profil invalide.');
  }
});

profileRoutes.delete('/', sameOriginOnly, async (c) => {
  try {
    await deleteOwnAccount(c.env.DB, c.var.member.id);
    clearSessionCookie(c);
    return c.body(null, 204);
  } catch (error) {
    return failure(c, error, 'Suppression impossible.');
  }
});
