import { and, eq, gte, isNull, max } from 'drizzle-orm';
import type { PlaySession } from './contract';
import type { Database } from './db';
import { orm } from './orm';
import { members, mmrEntries, playerRanks, playSessions, soloMmrEntries, soloRanks } from './schema';

// A member's play session (see src/lib/contract/play-session.ts): started by the member, their accounts read every
// two minutes by the rank source while it lasts. Left open, it ends on its own: half an hour after a rating of theirs
// last moved, as a player who stopped playing no longer moves one, and four hours after its start at most.

const minute = 60_000;
/** Without a move of the player's ratings for this long, they stopped playing. */
export const sessionQuiet = 30 * minute;
/** No session lasts longer: the rank source reads less often after it. */
export const sessionLongest = 4 * 60 * minute;

const later = (a: string, b: string | null | undefined) => (b && b > a ? b : a);

/** When a session ends: when stopped, else half an hour after a rating last moved since it started. */
export function sessionEnd(session: { startedAt: string; stoppedAt: string | null }, lastMove: string | null): string {
  if (session.stoppedAt) return session.stoppedAt;
  const quiet = Date.parse(later(session.startedAt, lastMove)) + sessionQuiet;
  return new Date(Math.min(quiet, Date.parse(session.startedAt) + sessionLongest)).toISOString();
}

/** The sessions under way, at `now`. */
export async function readPlaySessions(db: Database, now: number = Date.now()): Promise<PlaySession[]> {
  const query = orm(db);
  const rows = await query.select().from(playSessions);
  // Only an open session needs its ratings' last move: one row per account, through the (player, recorded_at) indexes.
  const open = rows.filter((row) => row.stoppedAt === null);
  const lookups = open.flatMap((row) => [
    query
      .select({ last: max(mmrEntries.recordedAt) })
      .from(mmrEntries)
      .where(and(eq(mmrEntries.player, row.player), gte(mmrEntries.recordedAt, row.startedAt))),
    query
      .select({ last: max(soloMmrEntries.recordedAt) })
      .from(soloMmrEntries)
      .where(and(eq(soloMmrEntries.player, row.player), gte(soloMmrEntries.recordedAt, row.startedAt))),
  ]);
  const [first, ...rest] = lookups;
  const moves = first ? await query.batch([first, ...rest]) : [];
  const lastMoves = new Map(
    open.map((row, index) => {
      const [duo, solo] = [moves[2 * index]?.[0]?.last ?? null, moves[2 * index + 1]?.[0]?.last ?? null];
      return [row.player, solo !== null && (duo === null || solo > duo) ? solo : duo];
    }),
  );
  return rows
    .map(({ player, startedAt, stoppedAt, startDuoMmr, startSoloMmr }) => ({
      player,
      startedAt,
      endsAt: sessionEnd({ startedAt, stoppedAt }, lastMoves.get(player) ?? null),
      startDuoMmr,
      startSoloMmr,
    }))
    .filter((session) => Date.parse(session.endsAt) > now);
}

/**
 * What the rank source reads every two minutes: the players in session, all their accounts, until the latest end of
 * their sessions.
 */
export async function readSessionReading(
  db: Database,
  now: number = Date.now(),
): Promise<{ sessionUntil: string | null; sessionPlayers: string[] }> {
  const sessions = await readPlaySessions(db, now);
  return {
    sessionUntil:
      sessions
        .map((session) => session.endsAt)
        .sort()
        .at(-1) ?? null,
    sessionPlayers: sessions.map((session) => session.player).sort(),
  };
}

class SessionRefused extends Error {
  status = 409;
}

/** Starts the member's session, or keeps the one under way. */
export async function startPlaySession(db: Database, memberId: string, now: number = Date.now()) {
  const query = orm(db);
  const member = await query.select({ player: members.duoPseudo }).from(members).where(eq(members.id, memberId)).get();
  if (!member?.player) throw new SessionRefused('Choisis d’abord ton pseudo duo dans Réglages.');
  const player = member.player;
  const running = (await readPlaySessions(db, now)).find((session) => session.player === player);
  if (running) return running;
  const [duo, solo] = await query.batch([
    query.select({ mmr: playerRanks.mmr }).from(playerRanks).where(eq(playerRanks.player, player)),
    query.select({ mmr: soloRanks.mmr }).from(soloRanks).where(eq(soloRanks.player, player)),
  ]);
  const started = {
    memberId,
    startedAt: new Date(now).toISOString(),
    stoppedAt: null,
    startDuoMmr: duo[0]?.mmr ?? null,
    startSoloMmr: solo[0]?.mmr ?? null,
  };
  await query
    .insert(playSessions)
    .values({ player, ...started })
    .onConflictDoUpdate({ target: playSessions.player, set: started });
  return (await readPlaySessions(db, now)).find((session) => session.player === player) ?? null;
}

/** Stops the member's session under way, if any. */
export async function stopPlaySession(db: Database, memberId: string, now: number = Date.now()): Promise<void> {
  await orm(db)
    .update(playSessions)
    .set({ stoppedAt: new Date(now).toISOString() })
    .where(and(eq(playSessions.memberId, memberId), isNull(playSessions.stoppedAt)));
}
