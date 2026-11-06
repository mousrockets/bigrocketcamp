import type { BoardChanges, BoardExercise, BoardReaction, FullBoard } from './board';
import type { Roster } from './club';
import type { BuiltResult } from './match-builds';
import { undoMs } from './monthly-mmr';
import { rankSourceStale } from './rank-source';
import { compareResults, reliabilityOf } from './reconcile';

// The board as the web app holds it: the rows received so far, which each answer of the API updates.

type SmallParts = Pick<BoardChanges, 'collectors' | 'doublesRanks' | 'monthly' | 'rankSource'>;

export interface SyncedBoard {
  /** The version to ask changes from. */
  version: number;
  /** The member the board was received for. */
  viewer: string | null;
  results: Map<string, BuiltResult>;
  exercises: Map<string, BoardExercise>;
  /** Reactions by exercise. */
  reactions: Map<string, BoardReaction[]>;
  small: SmallParts | null;
}

const resultKey = (matchGuid: string, playerId: string) => `${matchGuid}\u0000${playerId}`;

export function emptyBoard(): SyncedBoard {
  return { version: 0, viewer: null, results: new Map(), exercises: new Map(), reactions: new Map(), small: null };
}

/** Applies an answer to the board held, in place: what left first, then what is new or changed. */
export function applyChanges(board: SyncedBoard, changes: BoardChanges): SyncedBoard {
  if (changes.reset) Object.assign(board, emptyBoard());
  for (const [matchGuid, playerId] of changes.removed.results) board.results.delete(resultKey(matchGuid, playerId));
  for (const id of changes.removed.exercises) board.exercises.delete(id);
  for (const row of changes.results) board.results.set(resultKey(row.match_guid, row.player_id), row);
  for (const exercise of changes.exercises) board.exercises.set(exercise.id, exercise);
  if (changes.reactionsOf === 'all') board.reactions.clear();
  else for (const id of changes.reactionsOf) board.reactions.delete(id);
  for (const reaction of changes.reactions) {
    const list = board.reactions.get(reaction.exercise_id);
    if (list) list.push(reaction);
    else board.reactions.set(reaction.exercise_id, [reaction]);
  }
  board.small = {
    collectors: changes.collectors,
    doublesRanks: changes.doublesRanks,
    monthly: changes.monthly,
    rankSource: changes.rankSource,
  };
  board.version = changes.version;
  board.viewer = changes.viewer;
  return board;
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
  const results = [...board.results.values()].sort(compareResults);
  const exercises = [...board.exercises.values()].sort(
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
    reactions: [...board.reactions.values()]
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
  } as FullBoard;
}
