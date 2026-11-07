import { platforms } from '../club';
import type { Role } from '../members';
import { says, z } from '../validation';
import { email, invalidEmail } from './auth';
import type { Known } from './shared';

// For administrators: who is in the club, inviting someone, changing a role, removing a member.

// Written again rather than imported: members.ts would bring the database layer into the web app. A role it adds
// stops the answers below from type-checking until it is added here.
const roles = ['admin', 'member'] as const satisfies readonly Role[];

export const unknownMember = 'Membre inconnu.';
export const invalidRole = 'Rôle invalide.';
const role = z.enum(roles, says(invalidRole));
export const invitation = z.object({
  email: email(invalidEmail),
  role: role.nullish().transform((value) => value ?? 'member'),
});
export type Invitation = z.input<typeof invitation>;
export const roleChange = z.object({ id: z.string(says(unknownMember)), role });
export type RoleChange = z.input<typeof roleChange>;
export const memberToRemove = z.object({ id: z.string(says(unknownMember)) });
export type MemberToRemove = z.input<typeof memberToRemove>;

/** A member as the administrators see them; also the answer to an invitation. */
export const memberProfile = z.looseObject({
  id: z.string(),
  email: z.string(),
  role: z.enum(roles),
  duoPseudo: z.string().nullable(),
  soloPseudo: z.string().nullable(),
  platform: z.enum(platforms).nullable(),
});
export type MemberProfile = Known<z.output<typeof memberProfile>>;

export const memberList = z.looseObject({ members: z.array(memberProfile) });
export type MemberList = Known<z.output<typeof memberList>>;
