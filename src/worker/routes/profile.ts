import { Hono } from 'hono';
import { invalidDuoPseudo, type OwnProfile, profile } from '../../lib/contract';
import { deleteOwnAccount, readOwnProfile, saveOwnProfile } from '../../lib/members';
import { type AppEnv, clearSessionCookie, sameOriginOnly } from '../auth';
import { failure, noStore } from '../respond';
import { jsonBody } from '../validate';

/** Each member fills in their own profile, and can delete their own account. */
export const profileRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const own: OwnProfile = await readOwnProfile(c.env.DB, c.var.member.id);
    return c.json(own, 200, noStore);
  })
  .put('/', sameOriginOnly, ...jsonBody(profile, { invalid: invalidDuoPseudo }), async (c) => {
    try {
      const saved: OwnProfile = await saveOwnProfile(c.env.DB, c.var.member.id, c.req.valid('json'));
      return c.json(saved, 200, noStore);
    } catch (error) {
      return failure(c, error, 'Profil invalide.');
    }
  })
  .delete('/', sameOriginOnly, async (c) => {
    try {
      await deleteOwnAccount(c.env.DB, c.var.member.id);
      clearSessionCookie(c);
      return c.body(null, 204);
    } catch (error) {
      return failure(c, error, 'Suppression impossible.');
    }
  });
