import { soundIds } from '../sounds';
import { says, z } from '../validation';
import type { Known } from './shared';

// The sound badges: a draw for the series that cleared the member's debt, and every player's collection.

export const invalidSoundDraw = 'Tirage impossible.';
export const soundDrawInput = z.object({
  exerciseId: z.string(says(invalidSoundDraw)).regex(/^[a-zA-Z0-9-]{16,80}$/, says(invalidSoundDraw)),
});
export type SoundDrawInput = z.input<typeof soundDrawInput>;

/** A sound a newer API added is unknown to an older app: it shows nothing of it. */
const knownSound = z.enum(soundIds).nullable().catch(null);

export const soundDrawn = z.looseObject({
  sound: knownSound,
  /** The first draw of this sound by the member: its badge is new. */
  unlocked: z.boolean(),
});
export type SoundDrawn = Known<z.output<typeof soundDrawn>>;

export const soundCollection = z.looseObject({
  player: z.string(),
  badges: z.array(z.looseObject({ sound: knownSound, count: z.number() })),
});

export const soundCollections = z.looseObject({ collections: z.array(soundCollection) });
export type SoundCollections = Known<z.output<typeof soundCollections>>;
