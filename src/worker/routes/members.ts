import { Hono } from 'hono';
import { inviteMember, listMembers, removeMember, setMemberRole } from '../../lib/members';
import { type AppEnv, sameOrigin } from '../auth';
import { invalidEmail, invitation, memberToRemove, roleChange, unknownMember } from '../inputs';
import { failure, noStore } from '../respond';
import { jsonBody } from '../validate';

/** For administrators: who is in the club, inviting someone, changing a role, removing a member. */
export const memberRoutes = new Hono<AppEnv>();

memberRoutes.use(async (c, next) => {
  if (c.req.method !== 'GET' && !sameOrigin(c)) return c.json({ error: 'Origine refusée.' }, 403, noStore);
  await next();
});

memberRoutes.get('/', async (c) => c.json({ members: await listMembers(c.env.DB) }, 200, noStore));

memberRoutes.post('/', ...jsonBody(invitation, { invalid: invalidEmail }), async (c) => {
  const { email, role } = c.req.valid('json');
  try {
    return c.json(await inviteMember(c.env.DB, email, role), 201, noStore);
  } catch (error) {
    return failure(c, error, 'Invitation impossible.');
  }
});

memberRoutes.patch('/', ...jsonBody(roleChange, { invalid: unknownMember }), async (c) => {
  const { id, role } = c.req.valid('json');
  try {
    await setMemberRole(c.env.DB, id, role);
    return c.body(null, 204);
  } catch (error) {
    return failure(c, error, 'Changement de rôle impossible.');
  }
});

memberRoutes.delete('/', ...jsonBody(memberToRemove, { invalid: unknownMember }), async (c) => {
  try {
    await removeMember(c.env.DB, c.var.member.id, c.req.valid('json').id);
    return c.body(null, 204);
  } catch (error) {
    return failure(c, error, 'Retrait impossible.');
  }
});
