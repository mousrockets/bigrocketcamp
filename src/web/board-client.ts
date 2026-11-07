import { useEffect, useRef } from 'react';
import type { BoardChanges, FullBoard } from '../lib/board';
import { applyChanges, boardView, emptyBoard } from '../lib/board-sync';
import type { Roster } from '../lib/club';
import { boardChanges } from '../lib/contract';
import { defaultTimeoutMs } from '../lib/timeout';
import { parseOrThrow } from '../lib/validation';
import { apiWithin } from './api';
import { loadBoard, saveBoard } from './board-store';

// Keeps the board up to date while the page is visible. The API holds each request until something changes
// (at most 25 s), so a received match shows within seconds and an idle board costs a request every 25 s.
// Hidden, the page asks nothing; visible again, it catches up at once.

const waitSeconds = 25;
/** An API that answers at once, as older ones do, is asked at most this often. */
const minIntervalMs = 3000;
const restoreTimeoutMs = 2000;
/** The board is kept in the browser this long after its last change, not at every one. */
const saveDelayMs = 2000;
/** Time alone changes a few things shown (a rank source gone quiet, an undo window closed). */
const reviewEveryMs = 60_000;
const loadError = 'Impossible de charger les résultats. Vérifie ta connexion.';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
const isChanges = (body: unknown): body is BoardChanges =>
  typeof (body as BoardChanges | null)?.version === 'number' && Array.isArray((body as BoardChanges).removed?.results);

export class BoardClient {
  private board = emptyBoard();
  /** The whole board, from an API older than page-by-page reading. */
  private whole: FullBoard | null = null;
  private synced = false;
  private running = false;
  private generation = 0;
  private controller: AbortController | null = null;
  private publishedAt = 0;
  private restored: Promise<void> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  roster: Roster;
  private readonly onBoard: (board: FullBoard) => void;
  private readonly onError: (message: string) => void;
  /** How long a request may take beyond the time it asked the API to wait. */
  private readonly timeoutMs: number;

  constructor(
    roster: Roster,
    onBoard: (board: FullBoard) => void,
    onError: (message: string) => void,
    { timeoutMs = defaultTimeoutMs }: { timeoutMs?: number } = {},
  ) {
    this.roster = roster;
    this.onBoard = onBoard;
    this.onError = onError;
    this.timeoutMs = timeoutMs;
  }

  view(): FullBoard | null {
    if (this.whole) return this.whole;
    return this.synced ? boardView(this.board, this.roster) : null;
  }

  private publish() {
    const view = this.view();
    if (!view) return;
    this.publishedAt = Date.now();
    this.onBoard(view);
  }

  /** Asks until the board is complete; returns whether it changed. The first request may wait for a change. */
  private async exchange(wait: boolean, generation: number, signal: AbortSignal): Promise<boolean> {
    let changed = false;
    for (let page = 0; ; page++) {
      const holding = wait && page === 0 && this.synced && !this.whole;
      // A held request answers within its wait; past it, the connection is gone.
      const response = await apiWithin((holding ? waitSeconds * 1000 : 0) + this.timeoutMs).state.$get(
        { query: { since: String(this.board.version), ...(holding ? { wait: String(waitSeconds) } : {}) } },
        { init: { signal } },
      );
      if (response.status === 204) return changed;
      if (!response.ok) throw Error(loadError);
      const raw: unknown = await response.json();
      // A newer request took over: its answer wins.
      if (generation !== this.generation) return false;
      if (!isChanges(raw)) {
        this.whole = raw as FullBoard;
        return true;
      }
      this.whole = null;
      const body = parseOrThrow(boardChanges, raw, loadError);
      // A board kept for another member on this browser: start over, its "mine" marks are not this member's.
      if (this.board.viewer !== null && body.viewer !== this.board.viewer) {
        this.board = emptyBoard();
        this.synced = false;
        continue;
      }
      applyChanges(this.board, body);
      this.scheduleSave();
      changed = true;
      if (!body.more) {
        this.synced = true;
        return true;
      }
    }
  }

  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void saveBoard(this.board), saveDelayMs);
  }

  /** Shows the board kept from the last visit at once; the first exchange then brings what changed since. */
  private restore(): Promise<void> {
    // A browser database that does not answer is skipped: the board then reads everything from the API.
    const kept = Promise.race([loadBoard(), delay(restoreTimeoutMs).then(() => null)]);
    this.restored ??= kept.then((board) => {
      if (!board || this.synced) return;
      this.board = board;
      this.synced = true;
      this.publish();
    });
    return this.restored;
  }

  private async loop(generation: number, catchUp: boolean) {
    await this.restore();
    let failures = 0;
    let wait = !catchUp;
    while (this.running && generation === this.generation) {
      const controller = new AbortController();
      this.controller = controller;
      const started = Date.now();
      let changed = false;
      try {
        changed = await this.exchange(wait, generation, controller.signal);
        failures = 0;
        if (changed || Date.now() - this.publishedAt >= reviewEveryMs) this.publish();
      } catch (error) {
        if (controller.signal.aborted || generation !== this.generation) return;
        failures++;
        this.onError(error instanceof TypeError ? loadError : (error as Error).message);
        await delay(Math.min(30_000, minIntervalMs * failures));
        continue;
      }
      wait = true;
      const elapsed = Date.now() - started;
      if (this.whole || (!changed && elapsed < minIntervalMs)) await delay(minIntervalMs - elapsed);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    void this.loop(++this.generation, true);
  }

  stop() {
    this.running = false;
    this.generation++;
    this.controller?.abort();
  }

  /** Reads what changed now, without waiting: after the member's own action. */
  async refreshNow(): Promise<FullBoard | null> {
    this.controller?.abort();
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    try {
      await this.restore();
      await this.exchange(false, generation, controller.signal);
      if (generation !== this.generation) return null;
      this.publish();
      return this.view();
    } catch (error) {
      if (!controller.signal.aborted) this.onError(error instanceof TypeError ? loadError : (error as Error).message);
      return null;
    } finally {
      if (this.running && generation === this.generation) void this.loop(generation, false);
    }
  }
}

/**
 * Keeps the page's board up to date while it is visible, through the page's own state setters;
 * the returned function reads what changed at once.
 */
export function useBoard<Board>(
  roster: Roster,
  setBoard: (board: Board) => void,
  setError: (message: string) => void,
): () => Promise<Board | null> {
  const client = useRef<BoardClient | null>(null);
  if (client.current) client.current.roster = roster;

  // biome-ignore lint/correctness/useExhaustiveDependencies: one client per page; the roster is read on each update.
  useEffect(() => {
    const instance = new BoardClient(
      roster,
      (board) => {
        setBoard(board as Board);
        setError('');
      },
      setError,
    );
    client.current = instance;
    const follow = () => (document.hidden ? instance.stop() : instance.start());
    follow();
    document.addEventListener('visibilitychange', follow);
    return () => {
      document.removeEventListener('visibilitychange', follow);
      instance.stop();
    };
  }, []);

  return async () => ((await client.current?.refreshNow()) ?? null) as Board | null;
}
