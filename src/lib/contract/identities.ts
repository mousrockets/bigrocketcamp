import { says, z } from '../validation';
import type { Known } from './shared';

// The game identities of the club's players, and the players seen in received scoreboards. A change answers `done`.

export const invalidIdentity = 'Identifiant invalide.';
export const identityChange = z.object({
  slot: z.string(says(invalidIdentity)),
  playerId: z.string(says(invalidIdentity)).max(256, says(invalidIdentity)),
  action: z.enum(['confirm', 'remove'], says(invalidIdentity)).default('confirm'),
});
export type IdentityChangeInput = z.input<typeof identityChange>;

export const identityAlias = z.looseObject({ playerId: z.string(), primary: z.boolean() });

export const identity = z.looseObject({
  slot: z.string(),
  known: z.boolean(),
  owned: z.boolean(),
  aliases: z.array(identityAlias),
});
export type Identity = Known<z.output<typeof identity>>;

/** A player seen in a received scoreboard and bound to no club player yet. */
export const candidate = z.looseObject({ playerId: z.string(), name: z.string(), day: z.string() });
export type Candidate = Known<z.output<typeof candidate>>;

export const identityList = z.looseObject({
  /** Set since the Epic integration that confirmed identities on its own was retired. */
  retired: z.boolean().optional(),
  identities: z.array(identity),
  candidates: z.array(candidate),
});
export type IdentityList = Known<z.output<typeof identityList>>;
