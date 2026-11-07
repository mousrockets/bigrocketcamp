import type { BoardChanges, BoardExercise, BoardReaction, FullBoard } from './board';
import type { Roster } from './club';
import type { BuiltResult } from './match-builds';
import { defaultForfeitRules, defaultHighScoreRules, defaultLastPlaceRules } from './match-rules';
import { undoMs } from './monthly-mmr';
import { rankSourceStale } from './rank-source';
import { compareResults, reliabilityOf } from './reconcile';

// The board as the web app holds it: the rows received so far, which each answer of the API updates. Plain data,
// never changed in place: TanStack Query keeps it, compares it and saves it in the browser as it is.

type SmallParts = Pick<BoardChanges, 'collectors' | 'doublesRanks' | 'monthly' | 'rankSource' | 'rules'>;

export interface SyncedBoard {
  /** The version to ask changes from. */
  version: number;
  /** The member the board was received for. */
  viewer: string | null;
  /** By match and player. */
  results: Record<string, BuiltResult>;
  /** By id. */
  exercises: Record<string, BoardExercise>;
  /** Reactions by exercise. */
  reactions: Record<string, BoardReaction[]>;
  small: SmallParts | null;
}

const resultKey = (matchGuid: string, playerId: string) => `${matchGuid}\u0000${playerId}`;

export function emptyBoard(): SyncedBoard {
  return { version: 0, viewer: null, results: {}, exercises: {}, reactions: {}, small: null };
}

/** The board after an answer: what left first, then what is new or changed. The board given is left as it was. */
export function applyChanges(held: SyncedBoard, changes: BoardChanges): SyncedBoard {
  const board = changes.reset ? emptyBoard() : held;
  const results = { ...board.results };
  const exercises = { ...board.exercises };
  const reactions = changes.reactionsOf === 'all' ? {} : { ...board.reactions };
  for (const [matchGuid, playerId] of changes.removed.results) delete results[resultKey(matchGuid, playerId)];
  for (const id of changes.removed.exercises) delete exercises[id];
  for (const row of changes.results) results[resultKey(row.match_guid, row.player_id)] = row;
  for (const exercise of changes.exercises) exercises[exercise.id] = exercise;
  if (changes.reactionsOf !== 'all') for (const id of changes.reactionsOf) delete reactions[id];
  for (const reaction of changes.reactions) {
    reactions[reaction.exercise_id] = [...(reactions[reaction.exercise_id] ?? []), reaction];
  }
  const { collectors, doublesRanks, monthly, rankSource, rules } = changes;
  return {
    version: changes.version,
    viewer: changes.viewer,
    results,
    exercises,
    reactions,
    small: { collectors, doublesRanks, monthly, rankSource, rules },
  };
}

/** The player the member declares exercises for most often, the latest one on a tie. */
function usualPlayer(exercises: readonly BoardExercise[]): string | null {
  const counts = new Map<string, { count: number; latest: string }>();
  for (const exercise of exercises) {
    if (!exercise.mine) continue;
    const seen = counts.get(exercise.player);
    counts.set(exercise.player, {
      count: (seen?.count ?? 0) + 1,
      latest: seen && seen.latest > exercise.created ? seen.latest : exercise.created,
    });
  }
  let best: [string, { count: number; latest: string }] | null = null;
  for (const entry of counts) {
    if (
      !best ||
      entry[1].count > best[1].count ||
      (entry[1].count === best[1].count && entry[1].latest > best[1].latest)
    )
      best = entry;
  }
  return best?.[0] ?? null;
}

/** The board in the shape the page shows, with what only time changes evaluated at `now`. */
export function boardView(board: SyncedBoard, roster: Roster, now: number = Date.now()): FullBoard {
  const results = Object.values(board.results).sort(compareResults);
  const exercises = Object.values(board.exercises).sort(
    (a, b) => b.created.localeCompare(a.created) || a.id.localeCompare(b.id),
  );
  const matchRosters = new Map<string, number>();
  for (const row of results) {
    if (row.expected_players !== null && !matchRosters.has(row.match_guid))
      matchRosters.set(row.match_guid, row.expected_players);
  }
  const small = board.small;
  const monthly = small?.monthly;
  return {
    results: results.map(({ expected_players: _expected, ...row }) => row),
    exercises,
    matchRosters: [...matchRosters].map(([match_guid, expected_players]) => ({ match_guid, expected_players })),
    reliability: reliabilityOf(roster, results),
    reactions: Object.values(board.reactions)
      .flat()
      .sort((a, b) => a.exercise_id.localeCompare(b.exercise_id) || a.emoji.localeCompare(b.emoji)),
    me: usualPlayer(exercises),
    collectors: small?.collectors ?? [],
    doublesRanks: small?.doublesRanks ?? [],
    monthly: monthly && {
      ...monthly,
      debts: monthly.debts.map((debt) => ({
        ...debt,
        canUndo: debt.canUndo && debt.paidAt !== null && now - Date.parse(debt.paidAt) <= undoMs,
      })),
    },
    rankSource: small?.rankSource
      ? { ...small.rankSource, stale: rankSourceStale(small.rankSource.lastReadAt, now) }
      : null,
    // A board kept from an older API, or received from one, has no rules: the default ones apply.
    rules: small?.rules ?? {
      lastPlace: defaultLastPlaceRules,
      forfeit: defaultForfeitRules,
      highScore: defaultHighScoreRules,
    },
  } as FullBoard;
}
