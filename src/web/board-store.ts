import type { BoardExercise, BoardReaction } from '../lib/board';
import { emptyBoard, type SyncedBoard } from '../lib/board-sync';
import type { BuiltResult } from '../lib/match-builds';

// The board held by the page, kept in the browser between visits: reopening the app reads only what changed
// since, instead of the whole history. It is only a copy: lost or unreadable, the page reads everything again.

const databaseName = 'board';
const storeName = 'board';
const key = 'current';
/** Changes whenever the stored shape does: an older copy is then ignored. */
const format = 1;

interface StoredBoard {
  format: number;
  version: number;
  viewer: string | null;
  results: BuiltResult[];
  exercises: BoardExercise[];
  reactions: BoardReaction[];
  small: SyncedBoard['small'];
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(database.transaction(storeName, mode).objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function loadBoard(): Promise<SyncedBoard | null> {
  try {
    const stored = (await run('readonly', (store) => store.get(key))) as StoredBoard | undefined;
    if (stored?.format !== format) return null;
    const board = emptyBoard();
    board.version = stored.version;
    board.viewer = stored.viewer;
    for (const row of stored.results) board.results.set(`${row.match_guid}\u0000${row.player_id}`, row);
    for (const exercise of stored.exercises) board.exercises.set(exercise.id, exercise);
    for (const reaction of stored.reactions) {
      const list = board.reactions.get(reaction.exercise_id);
      if (list) list.push(reaction);
      else board.reactions.set(reaction.exercise_id, [reaction]);
    }
    board.small = stored.small;
    return board;
  } catch {
    return null;
  }
}

export async function saveBoard(board: SyncedBoard): Promise<void> {
  const stored: StoredBoard = {
    format,
    version: board.version,
    viewer: board.viewer,
    results: [...board.results.values()],
    exercises: [...board.exercises.values()],
    reactions: [...board.reactions.values()].flat(),
    small: board.small,
  };
  try {
    await run('readwrite', (store) => store.put(stored, key));
  } catch {
    // Private browsing or a full disk: the next visit reads everything again.
  }
}

/** On sign-out: the next member on this browser must not see which exercises were the previous one's. */
export async function forgetBoard(): Promise<void> {
  try {
    await run('readwrite', (store) => store.delete(key));
  } catch {
    // Nothing stored, or no storage at all.
  }
}
