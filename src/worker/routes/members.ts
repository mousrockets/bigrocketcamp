import { Hono } from 'hono';
import { inviteMember, listMembers, removeMember, setMemberRole } from '../../lib/members';
import { type AppEnv, normalizeEmail, sameOrigin } from '../auth';
import { failure, noStore, smallJson } from '../respond';

/** For administrators: who is in the club, inviting someone, changing a role, removing a member. */
export const memberRoutes = new Hono<AppEnv>();

memberRoutes.use(async (c, next) => {
  if (c.req.method !== 'GET' && !sameOrigin(c)) return c.json({ error: 'Origine refusée.' }, 403, noStore);
  await next();
});

memberRoutes.get('/', async (c) => c.json({ members: await listMembers(c.env.DB) }, 200, noStore));

memberRoutes.post('/', async (c) => {
  const body = await smallJson(c);
  const email = normalizeEmail(body?.email);
  if (!email) return c.json({ error: 'Adresse e-mail invalide.' }, 400, noStore);
  try {
    return c.json(await inviteMember(c.env.DB, email, body?.role ?? 'member'), 201, noStore);
  } catch (error) {
    return failure(c, error, 'Invitation impossible.');
  }
});

memberRoutes.patch('/', async (c) => {
  const body = await smallJson(c);
  try {
    await setMemberRole(c.env.DB, body?.id, body?.role);
    return c.body(null, 204);
  } catch (error) {
    return failure(c, error, 'Changement de rôle impossible.');
  }
});

memberRoutes.delete('/', async (c) => {
  const body = await smallJson(c);
  try {
    await removeMember(c.env.DB, c.var.member.id, body?.id);
    return c.body(null, 204);
  } catch (error) {
    return failure(c, error, 'Retrait impossible.');
  }
});
