import { z } from '../validation';
import type { Known } from './shared';

// Live scoreboards, sent by the collector or by the browser at the end of a match, or when its sender left it.

export { liveLeftInput, liveMatchInput, livePayloadInput } from '../live-stats';

export const invalidLiveMatch = 'Envoi invalide.';

/** The players this member can send live scoreboards for. */
export const livePlayers = z.looseObject({ players: z.array(z.string()) });
export type LivePlayers = Known<z.output<typeof livePlayers>>;

export const liveReceived = z.looseObject({
  ok: z.boolean(),
  /** The match the scoreboard was stored under. */
  match: z.string().optional(),
  /** How many players of the scoreboard were kept; for a match left, how many departures. */
  received: z.number(),
});
export type LiveReceived = Known<z.output<typeof liveReceived>>;
