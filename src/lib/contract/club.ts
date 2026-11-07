import { platforms } from '../club';
import { says, z } from '../validation';
import { ownProfile } from './profile';
import type { Known } from './shared';

// The club: its name and logo, public; its players, challenge rules and the member's own profile once signed in.

export const invalidClubName = 'Nom du club : de 2 à 60 caractères.';
export const clubName = z.object({
  name: z
    .string(says(invalidClubName))
    .transform((name) => name.trim().replace(/\s+/g, ' '))
    .pipe(z.string().regex(/^[^\p{C}]{2,60}$/u, says(invalidClubName))),
});
export type ClubNameInput = z.input<typeof clubName>;

export const invalidRuleChange = 'Règle des défis invalide.';
export const ruleChange = z.object({
  lastPlace: z.object({ enabled: z.boolean(says(invalidRuleChange)) }, says(invalidRuleChange)),
});
export type RuleChange = z.input<typeof ruleChange>;

/** What a visitor sees of the club before signing in; the page still works without it. */
export const clubIdentity = z.looseObject({
  name: z.string().catch(''),
  /** The uploaded logo's address, or null for the default picture. */
  logo: z.string().nullable().catch(null),
});
export type ClubIdentity = Known<z.output<typeof clubIdentity>>;

export const clubPlayer = z.looseObject({ slot: z.string(), platform: z.enum(platforms).nullable().catch(null) });
export type ClubPlayer = Known<z.output<typeof clubPlayer>>;

/** The +5 as it applies from `effectiveFrom` (a day in Paris) until the next change. */
export const lastPlaceRule = z.looseObject({
  enabled: z.boolean(),
  effectiveFrom: z.string(),
  ties: z.enum(['none', 'all']).catch('none'),
});

/** Also the answer to a change of the rules. Every change, oldest first: a match counts with its own day's rule. */
export const challengeRules = z.looseObject({ lastPlace: z.array(lastPlaceRule).readonly() });
export type ChallengeRules = Known<z.output<typeof challengeRules>>;

/** The club as a signed-in member sees it. */
export const club = clubIdentity.extend({
  players: z.array(clubPlayer),
  /** Absent from an API older than the challenge rules: the default ones then apply. */
  rules: challengeRules.optional(),
  me: ownProfile,
});
export type Club = Known<z.output<typeof club>>;

export const clubNameSaved = z.looseObject({ name: z.string() });
export type ClubNameSaved = Known<z.output<typeof clubNameSaved>>;

/** The answer to a new logo, or to its removal. */
export const clubLogo = z.looseObject({ logo: z.string().nullable() });
export type ClubLogo = Known<z.output<typeof clubLogo>>;
