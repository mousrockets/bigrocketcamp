import { says, z } from '../validation';
import type { Known } from './shared';

// A member's play session: they start it when they play, above all where no collector sees their matches (a console),
// so the rank source reads their accounts, duo and solo, every two minutes and no peak slips by; they stop it, or it
// ends on its own.

export const invalidPlaySession = 'Action de session invalide.';
export const playSessionAction = z.object({ action: z.enum(['start', 'stop'], says(invalidPlaySession)) });
export type PlaySessionAction = z.input<typeof playSessionAction>;

/** A session under way, as every member sees it in Matchs. */
export const playSession = z.looseObject({
  player: z.string(),
  startedAt: z.string(),
  /** When it ends unless a rating moves again: it then lasts longer. */
  endsAt: z.string(),
  /** The duo and solo ratings when it started; null when none was read yet. */
  startDuoMmr: z.number().nullable(),
  startSoloMmr: z.number().nullable(),
});
export type PlaySession = Known<z.output<typeof playSession>>;

/** The member's session after the action: null once stopped. */
export const playSessionAnswer = z.looseObject({ session: playSession.nullable() });
export type PlaySessionAnswer = Known<z.output<typeof playSessionAnswer>>;
