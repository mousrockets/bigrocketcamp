import { z } from 'zod';
import { platforms } from '../lib/club';
import { roles } from '../lib/members';
import { says } from '../lib/validation';

// What each route accepts, with the French message it answers when an input breaks a rule. Rules that need
// the database (a player of the club, a target of the rank source) stay in the routes.

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** An address as typed: spaces around and capitals do not matter. */
const email = (message: string) =>
  z.string(says(message)).trim().toLowerCase().max(254, says(message)).regex(emailPattern, says(message));

export const invalidEmail = 'Adresse e-mail invalide.';
export const signInEmail = z.object({ email: email(invalidEmail) });

export const invalidCode = 'Code invalide.';
export const signInCode = z.object({
  email: email(invalidCode),
  code: z
    .string(says(invalidCode))
    .trim()
    .regex(/^\d{6}$/, says(invalidCode)),
});

export const invalidClubName = 'Nom du club : de 2 à 60 caractères.';
export const clubName = z.object({
  name: z
    .string(says(invalidClubName))
    .transform((name) => name.trim().replace(/\s+/g, ' '))
    .pipe(z.string().regex(/^[^\p{C}]{2,60}$/u, says(invalidClubName))),
});

const codeAlphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const invalidPairingCode = 'Le code d’association fait 8 caractères.';
/** The pairing code as typed: case, spaces and dashes do not matter. */
export const pairingCode = z.object({
  code: z
    .string(says(invalidPairingCode))
    .transform((code) => code.toUpperCase().replace(/[\s-]/g, ''))
    .pipe(
      z
        .string()
        .length(8, says(invalidPairingCode))
        .refine((code) => [...code].every((char) => codeAlphabet.includes(char)), says(invalidPairingCode)),
    ),
});

export const unknownCollector = 'Collecteur inconnu.';
export const collectorToRevoke = z.object({ id: z.string(says(unknownCollector)) });

const exerciseId = /^[a-zA-Z0-9-]{16,80}$/;
export const unknownExercise = 'Série inconnue.';
export const exerciseToUndo = z.object({
  id: z.string(says(unknownExercise)).regex(exerciseId, says(unknownExercise)),
});

export const invalidReaction = 'Réaction invalide.';
export const reaction = z.object({
  exerciseId: z.string(says(invalidReaction)).regex(exerciseId, says(invalidReaction)),
  emoji: z.enum(['💪', '🔥', '😂'], says(invalidReaction)),
});

export const invalidIdentity = 'Identifiant invalide.';
export const identityChange = z.object({
  slot: z.string(says(invalidIdentity)),
  playerId: z.string(says(invalidIdentity)).max(256, says(invalidIdentity)),
  action: z.enum(['confirm', 'remove'], says(invalidIdentity)).default('confirm'),
});

export const unknownMember = 'Membre inconnu.';
export const invalidRole = 'Rôle invalide.';
const role = z.enum(roles, says(invalidRole));
export const invitation = z.object({
  email: email(invalidEmail),
  role: role.nullish().transform((value) => value ?? 'member'),
});
export const roleChange = z.object({ id: z.string(says(unknownMember)), role });
export const memberToRemove = z.object({ id: z.string(says(unknownMember)) });

export const unknownAction = 'Action inconnue.';
export const invalidDebt = 'Dette invalide.';
export const monthlyAction = z.discriminatedUnion(
  'action',
  [
    z.object({ action: z.literal('refresh') }),
    z.object({
      action: z.enum(['settle', 'undo']),
      id: z.string(says(invalidDebt)).max(160, says(invalidDebt)),
    }),
  ],
  says(unknownAction),
);

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

export const invalidRanks = 'Relevé de rangs invalide.';
const rankNumber = (min: number, max: number) =>
  z.int(says(invalidRanks)).min(min, says(invalidRanks)).max(max, says(invalidRanks));
/** A rank source's readings: at most a day old, never ahead of the clock by more than a minute. */
export const observedRanks = z.object({
  ranks: z
    .array(
      z.object({
        player: z.string(says(invalidRanks)),
        playerId: z.string(says(invalidRanks)),
        mmr: rankNumber(0, 10_000),
        tier: rankNumber(0, 22).nullable().default(null),
        division: rankNumber(1, 4).nullable().default(null),
        matches: rankNumber(0, 1_000_000).nullable().default(null),
        observedAt: z
          .string(says(invalidRanks))
          .refine((date) => Number.isFinite(Date.parse(date)), says(invalidRanks))
          .transform((date) => Date.parse(date))
          .refine(
            (observed) => observed <= Date.now() + 60_000 && observed >= Date.now() - 86_400_000,
            says(invalidRanks),
          )
          .transform((observed) => new Date(observed).toISOString()),
      }),
      says(invalidRanks),
    )
    .max(50, says(invalidRanks)),
});

export const invalidVersion = 'Version du tableau invalide.';
export const boardQuery = z.object({
  since: z.coerce.number(says(invalidVersion)).int(says(invalidVersion)).min(0, says(invalidVersion)).optional(),
  /** Seconds to hold the request while nothing changes; anything unreadable means no wait. */
  wait: z.coerce.number().catch(0).default(0),
});
