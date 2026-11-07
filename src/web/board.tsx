import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useMemo } from 'react';
import type { FullBoard } from '../lib/board';
import { applyChanges, boardView, emptyBoard, type SyncedBoard } from '../lib/board-sync';
import { boardChanges } from '../lib/contract';
import { defaultTimeoutMs } from '../lib/timeout';
import { parseOrThrow } from '../lib/validation';
import { apiWithin } from './api';
import { useClub } from './club';
import { useNow } from './hooks/use-now';
import { keptQueryTime } from './persistence';

// The board: every result, exercise and rank of the club. It is a TanStack Query query like the others, kept in the
// browser between visits (persistence.ts). While the app is visible, the query asks again and again; the API holds
// each request until something changes (at most 25 s), so a received match shows within seconds and an idle board
// costs a request every 25 s. The tabs share it through the app shell.

/** The board as the pages read it. */
export type Board = FullBoard;

const waitSeconds = 25;
const loadError = 'Impossible de charger les résultats. Vérifie ta connexion.';
/** The query asks again this long after each answer. */
const askEveryMs = 1000;

/**
 * When the last answer came, for each member's board. Within the follow-up delay, the next request may wait for a
 * change; after a pause (a hidden app, a write of the member's own), it catches up at once.
 */
const lastAnswer = new Map<string, number>();
const followingFor = askEveryMs * 5;

/** Asks until the board is complete: from `held`, every page of what changed. */
async function follow(memberId: string, held: SyncedBoard | undefined, signal: AbortSignal): Promise<SyncedBoard> {
  let board = held ?? emptyBoard();
  for (let page = 0; ; page++) {
    const holding = page === 0 && held !== undefined && Date.now() - (lastAnswer.get(memberId) ?? 0) < followingFor;
    // A held request answers within its wait; past it, the connection is gone.
    const response = await apiWithin((holding ? waitSeconds * 1000 : 0) + defaultTimeoutMs).state.$get(
      { query: { since: String(board.version), ...(holding ? { wait: String(waitSeconds) } : {}) } },
      { init: { signal } },
    );
    lastAnswer.set(memberId, Date.now());
    if (response.status === 204) return board;
    if (!response.ok) throw new Error(loadError);
    const changes = parseOrThrow(boardChanges, await response.json(), loadError);
    // A board kept for another member on this browser: start over, its "mine" marks are not this member's.
    if (board.viewer !== null && changes.viewer !== board.viewer) {
      board = emptyBoard();
      continue;
    }
    board = applyChanges(board, changes);
    if (!changes.more) return board;
  }
}

export const boardQuery = (memberId: string) =>
  queryOptions({
    queryKey: ['board', memberId],
    queryFn: ({ client, queryKey, signal }) =>
      follow(memberId, client.getQueryData<SyncedBoard>(queryKey), signal).catch((error: unknown) => {
        throw error instanceof TypeError ? new Error(loadError) : error;
      }),
    refetchInterval: askEveryMs,
    // Hidden, the app asks nothing; visible again, it catches up at once (BoardProvider).
    refetchIntervalInBackground: false,
    // A lost connection is tried again, ever more slowly, until it comes back.
    retry: true,
    retryDelay: (failures) => Math.min(30_000, 3000 * failures),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: keptQueryTime,
  });

export interface BoardState {
  /** Null until the first copy arrives, from the browser or the API. */
  board: Board | null;
  /** Why the last request failed; empty while the board follows the club live. */
  error: string;
  /** Reads what changed at once, after a write. */
  refresh: () => Promise<Board | null>;
}

export const BoardContext = createContext<BoardState | null>(null);

export function BoardProvider({ children }: { children: ReactNode }) {
  const { roster, me } = useClub();
  const queryClient = useQueryClient();
  const query = boardQuery(me.id);
  const { data, failureReason } = useQuery(query);
  // Time alone changes a few things shown: a rank source gone quiet, an undo window closed.
  const now = useNow(60_000);
  const board = useMemo(() => (data ? boardView(data, roster, now) : null), [data, roster, now]);

  const refresh = async () => {
    lastAnswer.delete(me.id);
    await queryClient.refetchQueries({ queryKey: query.queryKey });
    const synced = queryClient.getQueryData<SyncedBoard>(query.queryKey);
    return synced ? boardView(synced, roster) : null;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh reads the latest board each time.
  useEffect(() => {
    const catchUp = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', catchUp);
    return () => document.removeEventListener('visibilitychange', catchUp);
  }, [me.id]);

  return <BoardContext value={{ board, error: failureReason?.message ?? '', refresh }}>{children}</BoardContext>;
}

export function useBoardState(): BoardState {
  const state = useContext(BoardContext);
  if (!state) throw new Error('useBoardState needs the app shell.');
  return state;
}
