import { defaultLastPlaceRules } from '../match-rules';
import { says, z } from '../validation';
import { challengeRules } from './club';
import { monthlyStandings } from './monthly';
import type { Known } from './shared';

// The board (GET /api/state): from `since`, what changed after that version, page by page; the API may hold the
// request up to `wait` seconds while nothing changes, then answers 204. Without `since`, the whole board of the
// boards built before page-by-page reading, which this contract does not describe.

export const invalidVersion = 'Version du tableau invalide.';
export const boardQuery = z.object({
  since: z.coerce.number(says(invalidVersion)).int(says(invalidVersion)).min(0, says(invalidVersion)).optional(),
  /** Seconds to hold the request while nothing changes; anything unreadable means no wait. */
  wait: z.coerce.number().catch(0).default(0),
});

/** A player's line of a match, as its sources reconcile it. */
export const boardResult = z.looseObject({
  match_guid: z.string(),
  player_id: z.string(),
  name: z.string(),
  day: z.string(),
  kind: z.string(),
  team: z.number(),
  winner: z.number(),
  score: z.number(),
  goals: z.number(),
  assists: z.number(),
  saves: z.number(),
  received: z.string(),
  review_required: z.boolean(),
  verification: z.enum(['review', 'corrected', 'confirmed', 'single']),
  source_types: z.array(z.string()),
  selected_source: z.string(),
  source_difference: z.enum(['result', 'stats', 'identity']).nullable(),
  /** Set on every row of a match whose full scoreboard a source confirmed. */
  expected_players: z.number().nullable(),
});
export type BoardResult = Known<z.output<typeof boardResult>>;

export const boardExercise = z.looseObject({
  id: z.string(),
  player: z.string(),
  count: z.number(),
  day: z.string(),
  created: z.string(),
  type: z.string(),
  /** Authors stay private: a member only learns which exercises are theirs. */
  mine: z.boolean(),
});
export type BoardExercise = Known<z.output<typeof boardExercise>>;

export const boardReaction = z.looseObject({
  exercise_id: z.string(),
  emoji: z.string(),
  count: z.number(),
  /** 1 when the member reacted with this emoji. */
  mine: z.number(),
});
export type BoardReaction = Known<z.output<typeof boardReaction>>;

/** When each live source last sent something. */
export const collectorContact = z.looseObject({ id: z.string(), last_seen: z.string() });

/** The season's highest rating the rank source read, with the rank it came with. */
export const seasonPeak = z.looseObject({ mmr: z.number(), label: z.string(), tier: z.number().nullable() });
export type SeasonPeak = Known<z.output<typeof seasonPeak>>;

const rankFields = {
  mmr: z.number().nullable(),
  label: z.string(),
  /** Shown as the rank icon; null while no rank was read. */
  tier: z.number().nullable(),
  matchesPlayed: z.number().nullable(),
  fetchedAt: z.string().nullable(),
  /** Absent from an API older than the season peaks. */
  peak: seasonPeak.nullable().catch(null),
};

export const soloRank = z.looseObject({
  ...rankFields,
  /** Why the account shows no fresh rank: `ready` when it was read, else what the player can do about it. */
  status: z.enum(['waiting', 'ready', 'not_found', 'needs_player_id', 'lookup_unavailable', 'read_failed']),
});
export type SoloRank = Known<z.output<typeof soloRank>>;

export const doublesRank = z.looseObject({
  ...rankFields,
  player: z.string(),
  status: z.string(),
  lastAttempt: z.string().nullable(),
  /** Null when the player named no solo account; absent from an API older than solo accounts. */
  solo: soloRank.nullable().catch(null),
});
export type DoublesRank = Known<z.output<typeof doublesRank>>;

/** Only an instance with a rank source can see it stop. */
export const rankSourceHealth = z.looseObject({ lastReadAt: z.string().nullable(), stale: z.boolean() });
export type RankSourceHealth = Known<z.output<typeof rankSourceHealth>>;

/** The parts of the board small enough to be sent whole with every change. */
const smallParts = {
  collectors: z.array(collectorContact),
  doublesRanks: z.array(doublesRank),
  monthly: monthlyStandings,
  rankSource: rankSourceHealth.nullable().catch(null),
  /** Absent from an API older than the challenge rules: the default ones then apply. */
  rules: challengeRules.catch(() => ({ lastPlace: defaultLastPlaceRules.map((rule) => ({ ...rule })) })),
};

export const boardChanges = z.looseObject({
  ...smallParts,
  /** Who the answer was made for: which exercises and reactions are "mine" depends on it. */
  viewer: z.string(),
  /** Ask again from this version. */
  version: z.number(),
  /** More pages follow: ask again at once. */
  more: z.boolean(),
  /** Forget everything held so far: this answer starts the board over. */
  reset: z.boolean(),
  results: z.array(boardResult),
  exercises: z.array(boardExercise),
  /** The reactions of the exercises listed in `reactionsOf`, which replace those held. */
  reactions: z.array(boardReaction),
  /** Exercises whose reactions are replaced, or every one of them. */
  reactionsOf: z.union([z.array(z.string()), z.literal('all')]),
  removed: z.looseObject({
    results: z.array(z.tuple([z.string(), z.string()])),
    exercises: z.array(z.string()),
  }),
});
export type BoardChanges = Known<z.output<typeof boardChanges>>;
