import { Hono } from 'hono';
import { type BoardReader, prepareBoard, readBoardChanges, readFullBoard, readHead } from '../../lib/board';
import { type BoardChanges, boardQuery, invalidVersion } from '../../lib/contract';
import { parisMonth } from '../../lib/monthly-mmr';
import { type AppEnv, sha256 } from '../auth';
import { noStore } from '../respond';
import { queryOf } from '../validate';

/** An open board waits at most this long for a change, then asks again. */
export const maxWaitSeconds = 25;
/** How often a waiting board checks the version: a received match shows within this delay. */
const checkEveryMs = 2000;
const hourMs = 3_600_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const stateRoutes = new Hono<AppEnv>().get('/', queryOf(boardQuery, invalidVersion), async (c) => {
  const reader: BoardReader = {
    db: c.env.DB,
    memberId: c.var.member.id,
    hasRankSource: Boolean(c.env.RANK_SOURCE_KEY),
  };
  const { since: from, wait: waitSeconds } = c.req.valid('query');
  if (from === undefined) return fullBoard(c.req.header('if-none-match'), reader);
  const wait = Math.min(maxWaitSeconds, Math.max(0, waitSeconds || 0)) * 1000;
  const started = Date.now();
  for (;;) {
    const head = await readHead(reader.db);
    if (from === 0 || head.version !== from || head.pending) {
      const { players, pending } = await prepareBoard(reader.db);
      // The board reads its collectors without a row type: their shape is only the contract's word until it has one.
      const changes: Omit<BoardChanges, 'collectors'> & { collectors: unknown[] } = await readBoardChanges(
        reader,
        players,
        from,
        { pending },
      );
      return c.json(changes, 200, noStore);
    }
    // Nothing new: an empty answer, and the board asks again.
    if (Date.now() - started + checkEveryMs > wait) return c.body(null, 204, noStore);
    await sleep(checkEveryMs);
  }
});

/**
 * The whole board, for boards loaded before page-by-page reading. Revalidated on every poll: an unchanged
 * board costs an empty 304 and a single row read.
 */
async function fullBoard(ifNoneMatch: string | undefined, reader: BoardReader) {
  const viewer = (await sha256(reader.memberId)).slice(0, 12);
  // Within the hour, time alone (a rank source going quiet, an undo window closing) changes nothing shown.
  const tagOf = (version: number) => `"${version}-${viewer}-${parisMonth()}-${Math.floor(Date.now() / hourMs)}"`;
  const head = await readHead(reader.db);
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-cache' };
  if (!head.pending && ifNoneMatch === tagOf(head.version)) {
    return new Response(null, { status: 304, headers: { ...headers, ETag: tagOf(head.version) } });
  }
  const { players, pending } = await prepareBoard(reader.db);
  // Read before the board: a change made meanwhile gives a newer version, never an older body.
  const { version } = await readHead(reader.db);
  const body = JSON.stringify({ ...(await readFullBoard(reader, players)), version });
  if (!pending) headers.ETag = tagOf(version);
  return new Response(body, { headers });
}
