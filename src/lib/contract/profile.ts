import { platforms } from '../club';
import { comparedPros } from '../pros';
import { says, z } from '../validation';
import { firstName, memberProfile } from './members';
import type { Known } from './shared';

// Each member fills in their own profile, and can delete their own account (204).

// "observer" is the slot of the retired Epic integration's spectator account.
const reservedSlots = ['observer'];
export const invalidDuoPseudo = 'Pseudo duo : de 2 à 32 lettres, chiffres, espaces, points ou tirets.';
const invalidSoloPseudo = 'Pseudo solo : 32 caractères au plus.';
export const profile = z.object({
  /** The player slot every game record is keyed by. */
  duoPseudo: z
    .string(says(invalidDuoPseudo))
    .trim()
    .toLowerCase()
    .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,31}$/u, says(invalidDuoPseudo))
    .refine((pseudo) => !reservedSlots.includes(pseudo), says(invalidDuoPseudo)),
  soloPseudo: z
    .string(says(invalidSoloPseudo))
    .trim()
    .nullish()
    .transform((pseudo) => pseudo || null)
    .refine((pseudo) => pseudo === null || /^[^\p{C}]{1,32}$/u.test(pseudo), says(invalidSoloPseudo)),
  platform: z.enum(platforms, says('Choisis ta plateforme.')),
  /** Left out by an app older than first names: the saved one then stays. */
  firstName: firstName.optional(),
});
export type ProfileInput = z.input<typeof profile>;

/** The member's own profile, read and saved. */
export const ownProfile = memberProfile.extend({
  /** A duo pseudo with game history no longer changes: every record of the player is keyed by it. */
  duoPseudoLocked: z.boolean(),
  /** Whom the member measures against on Stats; absent from an API older than the pros, null until they choose. */
  comparedPro: z.string().nullable().catch(null),
});
export type OwnProfile = Known<z.output<typeof ownProfile>>;

export const invalidComparedPro = 'Choisis un pro de la liste.';
/** Whom the member measures against on Stats, from then on and on every device. */
export const comparedProInput = z.object({
  pro: z.string(says(invalidComparedPro)).refine((pro) => comparedPros.includes(pro), says(invalidComparedPro)),
});
export type ComparedProInput = z.input<typeof comparedProInput>;
