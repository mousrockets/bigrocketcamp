import { platforms } from '../club';
import { says, z } from '../validation';
import { memberProfile } from './members';
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
});
export type ProfileInput = z.input<typeof profile>;

/** The member's own profile, read and saved. */
export const ownProfile = memberProfile.extend({
  /** A duo pseudo with game history no longer changes: every record of the player is keyed by it. */
  duoPseudoLocked: z.boolean(),
});
export type OwnProfile = Known<z.output<typeof ownProfile>>;
