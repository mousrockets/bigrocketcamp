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
export const invalidFirstName = 'Prénom : 32 caractères au plus.';
/** A first name, or null to remove it: an empty field removes it. */
export const firstName = z
  .string(says(invalidFirstName))
  .trim()
  .nullable()
  .transform((name) => name?.replace(/\s+/g, ' ') || null)
  .refine((name) => name === null || /^[^\p{C}]{1,32}$/u.test(name), says(invalidFirstName));
/** An admin changes a member's role, their first name, or both. */
export const memberChange = z
  .object({ id: z.string(says(unknownMember)), role: role.optional(), firstName: firstName.optional() })
  .refine((change) => change.role !== undefined || change.firstName !== undefined, says(unknownMember));
export type MemberChange = z.input<typeof memberChange>;
export const memberToRemove = z.object({ id: z.string(says(unknownMember)) });
export type MemberToRemove = z.input<typeof memberToRemove>;

/** A member as the administrators see them; also the answer to an invitation. */
export const memberProfile = z.looseObject({
  id: z.string(),
  email: z.string(),
  role: z.enum(roles).catch('member'),
  /** Absent from an API older than first names. */
  firstName: z.string().nullable().catch(null),
  duoPseudo: z.string().nullable(),
  soloPseudo: z.string().nullable(),
  platform: z.enum(platforms).nullable().catch(null),
});
export type MemberProfile = Known<z.output<typeof memberProfile>>;

export const memberList = z.looseObject({ members: z.array(memberProfile) });
export type MemberList = Known<z.output<typeof memberList>>;
