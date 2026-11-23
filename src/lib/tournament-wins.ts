import { eq } from 'drizzle-orm';
import type { Roster } from './club';
import type { Database } from './db';
import { matchModeOf } from './live-stats';
import { orm } from './orm';
import { matchResults, tournamentWins } from './schema';

// A tournament won, declared by a member on its last match: the game only sends each match, never the bracket.

/** Whether a club player won this tournament match, present at the end: only then can it close a tournament won. */
export async function canCloseTournament(db: Database, roster: Roster, matchGuid: string): Promise<boolean> {
  const rows = await orm(db)
    .select({
      name: matchResults.name,
      kind: matchResults.kind,
      team: matchResults.team,
      winner: matchResults.winner,
      reviewRequired: matchResults.reviewRequired,
      leftEarly: matchResults.leftEarly,
      playlist: matchResults.playlist,
    })
    .from(matchResults)
    .where(eq(matchResults.matchGuid, matchGuid));
  return (
    rows.some((row) => matchModeOf(row.playlist) === 'tournament') &&
    rows.some(
      (row) =>
        roster.includes(row.name) &&
        row.kind === 'match' &&
        !row.reviewRequired &&
        !row.leftEarly &&
        row.team === row.winner,
    )
  );
}

/** Declares the tournament won; declaring it again changes nothing. */
export async function declareTournamentWin(db: Database, roster: Roster, matchGuid: string): Promise<void> {
  if (!(await canCloseTournament(db, roster, matchGuid))) {
    throw new Error('Seul un match de tournoi gagné par le club peut finir un tournoi gagné.');
  }
  await orm(db).insert(tournamentWins).values({ matchGuid }).onConflictDoNothing();
}

/** Takes a tournament won back: a mistake, or not the final after all. */
export async function cancelTournamentWin(db: Database, matchGuid: string): Promise<void> {
  await orm(db).delete(tournamentWins).where(eq(tournamentWins.matchGuid, matchGuid));
}
