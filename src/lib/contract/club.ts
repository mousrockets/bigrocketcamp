import { platforms } from '../club';
import { defaultForfeitRules, defaultHighScoreRules } from '../match-rules';
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
/** One rule turned on or off from tomorrow. */
export const ruleSwitch = z.object({ enabled: z.boolean(says(invalidRuleChange)) }, says(invalidRuleChange));
/**
 * The rules an admin changes: the +5, the −5 of a forfeit won, the −10 from 1000 points, or several; a rule
 * left out stays as it is.
 */
export const ruleChange = z
  .object(
    { lastPlace: ruleSwitch.optional(), forfeit: ruleSwitch.optional(), highScore: ruleSwitch.optional() },
    says(invalidRuleChange),
  )
  .refine((change) => change.lastPlace || change.forfeit || change.highScore, says(invalidRuleChange));
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

/** The −5 of a win the opponents forfeited, as it applies from `effectiveFrom` (a day in Paris). */
export const forfeitRule = z.looseObject({ enabled: z.boolean(), effectiveFrom: z.string() });

/** The −10 of a game from 1000 points, as it applies from `effectiveFrom` (a day in Paris). */
export const highScoreRule = z.looseObject({ enabled: z.boolean(), effectiveFrom: z.string() });

/** Also the answer to a change of the rules. Every change, oldest first: a match counts with its own day's rule. */
export const challengeRules = z.looseObject({
  lastPlace: z.array(lastPlaceRule).readonly(),
  /** Absent from an API older than the switch of the −5: it then applies every day, as it did. */
  forfeit: z
    .array(forfeitRule)
    .readonly()
    .catch(() => defaultForfeitRules.map((rule) => ({ ...rule }))),
  /** Absent from an API older than the −10 from 1000 points: it then applies as the club decided it. */
  highScore: z
    .array(highScoreRule)
    .readonly()
    .catch(() => defaultHighScoreRules.map((rule) => ({ ...rule }))),
});
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
