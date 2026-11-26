import { z } from './validation';

// The stats the Windows collector sends since 0.7.0, beyond the scoreboard: shots, touches, the game's own stat feed,
// kickoffs, own goals, assists by scorer, the fastest, longest and quickest goals, the hardest hit, and the arena.
// Its README (« Les stats de chaque joueur ») describes them. They travel together as one object, stored as JSON on
// each line of a match: a stat the collector adds later needs no new column.

const count = z.int().min(0).max(1_000_000);
/** The game's name of a stat feed event, as the collector keeps it: « Save », « Demolish »… */
const eventName = z.string().regex(/^[A-Za-z0-9_]{1,32}$/);
const counts = (key: z.ZodType<string>, max: number) =>
  z.record(key, count).refine((byKey) => Object.keys(byKey).length <= max);
const measure = (max: number) => z.number().positive().max(max);
const dropped = <Schema extends z.ZodType>(schema: Schema) => schema.optional().catch(undefined);

/**
 * The fields of a player's line in a live payload, as the collector names them. Each one unreadable is dropped on
 * its own: an odd stat never costs the match.
 */
export const liveGameStats = {
  Shots: dropped(count),
  Touches: dropped(count),
  CarTouches: dropped(count),
  Statfeed: dropped(counts(eventName, 30)),
  StatfeedSecondary: dropped(counts(eventName, 30)),
  KickoffTouches: dropped(count),
  OwnGoals: dropped(count),
  AssistsTo: dropped(counts(z.string().min(1).max(256), 16)),
  FastestGoal: dropped(measure(100_000)),
  LongestGoal: dropped(measure(20_000)),
  QuickestGoal: dropped(measure(10_800)),
  HardestHit: dropped(measure(100_000)),
};

/** The map a match was played on, as the game names it: « Stadium_P ». */
export const arenaName = z.string().regex(/^[A-Za-z0-9_]{1,64}$/);

/** Each stat feed event's name, with the words the game shows for it in the player's language. */
export const liveStatfeedLabels = z
  .record(
    eventName,
    z
      .string()
      .trim()
      .min(1)
      .max(64)
      .refine((label) => !/\p{Cc}/u.test(label)),
  )
  .refine((labels) => Object.keys(labels).length <= 60);

/**
 * A player's stats of a match beyond the scoreboard, as stored and as the board sends them. Every field is optional:
 * a collector older than one sends none of it. Each one unreadable is dropped on its own, so that an app reading a
 * newer API keeps the rest.
 */
export const gameStats = z.looseObject({
  shots: dropped(count),
  touches: dropped(count),
  carTouches: dropped(count),
  /** How many times the player got each stat feed event, by its name. */
  statfeed: dropped(z.record(z.string(), count)),
  /** The same when the player was its second target: a demolition they took. */
  statfeedSecondary: dropped(z.record(z.string(), count)),
  /** Kickoffs they touched first. */
  kickoffTouches: dropped(count),
  ownGoals: dropped(count),
  /** Assists they gave, by the scorer's game ID. */
  assistsTo: dropped(z.record(z.string(), count)),
  /** Their fastest goal's speed, as the game sends it (Unreal units per second, according to its documentation). */
  fastestGoal: dropped(z.number().positive()),
  /** Their longest goal, in Unreal units (centimetres), on the ground, from their last touch to the goal line. */
  longestGoal: dropped(z.number().positive()),
  /** Their quickest goal after a kickoff, in seconds. */
  quickestGoal: dropped(z.number().positive()),
  /** Their hardest hit's ball speed, in Unreal units per second. */
  hardestHit: dropped(z.number().positive()),
  arena: dropped(arenaName),
});
export type GameStats = z.output<typeof gameStats>;

const liveLine = z.looseObject(liveGameStats);

/** The stats of a player's live line beyond the scoreboard, with the match's arena; null when it carries none. */
export function gameStatsOf(player: object, arena: unknown): GameStats | null {
  const line = liveLine.parse(player);
  const stats: GameStats = {
    shots: line.Shots,
    touches: line.Touches,
    carTouches: line.CarTouches,
    statfeed: line.Statfeed,
    statfeedSecondary: line.StatfeedSecondary,
    kickoffTouches: line.KickoffTouches,
    ownGoals: line.OwnGoals,
    assistsTo: line.AssistsTo,
    fastestGoal: line.FastestGoal,
    longestGoal: line.LongestGoal,
    quickestGoal: line.QuickestGoal,
    hardestHit: line.HardestHit,
    arena: arenaName.safeParse(arena).data,
  };
  const known = Object.fromEntries(Object.entries(stats).filter(([, value]) => value !== undefined));
  return Object.keys(known).length > 0 ? (known as GameStats) : null;
}

/** Game stats kept as JSON, read back; null when absent or unreadable. */
export function storedGameStats(json: string | null | undefined): GameStats | null {
  if (!json) return null;
  try {
    return gameStats.safeParse(JSON.parse(json)).data ?? null;
  } catch {
    return null;
  }
}

/** The game's words for each stat feed event of a payload; none when absent or unreadable. */
export const statfeedLabelsOf = (labels: unknown): [name: string, label: string][] =>
  Object.entries(liveStatfeedLabels.safeParse(labels).data ?? {});
