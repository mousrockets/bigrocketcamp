import { matchModeOf } from '../../lib/live-stats';
import { mvpOf } from '../../lib/match-history';
import { matchIndex } from '../../lib/match-rules';
import type { Board } from '../board';

/** What a player did in every match the club received, as the sheet of their card shows it. */
export interface Career {
  matches: number;
  wins: number;
  losses: number;
  goals: number;
  assists: number;
  saves: number;
  mvps: number;
  /** Null while no match of the player came with them: collectors older than these counts send none. */
  demos: number | null;
  crossbarHits: number | null;
  /** The most matches won in a row, and lost in a row, in the order they were played. */
  winStreak: number;
  lossStreak: number;
  /** Tournaments the club declared won on a match this player won. */
  tournamentsWon: number;
}

/**
 * Which matches count: every one, the ranked ones, one ranked playlist (1v1, 2v2, 3v3), or the tournaments. A match
 * whose playlist no source sent only counts in all of them.
 */
export type CareerScope = 'all' | 'ranked' | 'duel' | 'doubles' | 'standard' | 'tournament';

/** Which of the player's accounts the matches were played on: the solo one, the duo one, or either. */
export type CareerAccount = 'all' | 'solo' | 'duo';

const rankedPlaylists = { duel: 10, doubles: 11, standard: 13 } as const;

function inScope(scope: CareerScope, playlist: number | null | undefined) {
  if (scope === 'all') return true;
  if (scope === 'ranked' || scope === 'tournament') return matchModeOf(playlist) === scope;
  return playlist === rankedPlaylists[scope];
}

/** The game ID of the player's solo account, in lower case, once the rank source found it. */
export const soloAccountOf = (board: Board, name: string): string | null =>
  board.doublesRanks?.find((rank) => rank.player === name)?.solo?.playerId?.toLowerCase() ?? null;

function onAccount(account: CareerAccount, solo: string | null, playerId: string) {
  if (account === 'all') return true;
  return (solo === playerId.toLowerCase()) === (account === 'solo');
}

const added = (total: number | null, value: number | null | undefined) =>
  typeof value === 'number' ? (total ?? 0) + value : total;

/** The player's lines of the matches no source disputes, each match once, and the MVPs among them. */
export function careerOf(board: Board, name: string, scope: CareerScope, account: CareerAccount = 'all'): Career {
  const solo = soloAccountOf(board, name);
  const index = matchIndex(board.results, board.matchRosters ?? []);
  const lines = new Map(
    board.results
      .filter(
        (row) =>
          row.name === name &&
          row.kind === 'match' &&
          !row.review_required &&
          inScope(scope, row.playlist) &&
          onAccount(account, solo, row.player_id),
      )
      .map((row) => [row.match_guid, row]),
  );
  const career: Career = {
    matches: 0,
    wins: 0,
    losses: 0,
    goals: 0,
    assists: 0,
    saves: 0,
    mvps: 0,
    demos: null,
    crossbarHits: null,
    winStreak: 0,
    lossStreak: 0,
    tournamentsWon: 0,
  };
  const tournamentsWon = board.rules?.tournamentWins ?? [];
  // A match received late (an import, a source catching up) still belongs to its own day.
  const played = [...lines].sort(
    ([, a], [, b]) => a.day.localeCompare(b.day) || (a.received ?? a.day).localeCompare(b.received ?? b.day),
  );
  // Wins in a row while positive, losses in a row while negative.
  let run = 0;
  for (const [guid, row] of played) {
    // A player who left lost the match, whatever his team did after.
    const won = !row.left && row.team === row.winner;
    career.matches++;
    career[won ? 'wins' : 'losses']++;
    run = won ? Math.max(run, 0) + 1 : Math.min(run, 0) - 1;
    career.winStreak = Math.max(career.winStreak, run);
    career.lossStreak = Math.max(career.lossStreak, -run);
    career.goals += row.goals;
    career.assists += row.assists;
    career.saves += row.saves;
    career.demos = added(career.demos, row.demos);
    career.crossbarHits = added(career.crossbarHits, row.crossbar_hits);
    if (!row.left && mvpOf(index.get(guid)) === row.player_id) career.mvps++;
    if (won && tournamentsWon.includes(guid)) career.tournamentsWon++;
  }
  return career;
}
