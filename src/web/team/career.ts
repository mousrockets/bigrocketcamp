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
}

const added = (total: number | null, value: number | null | undefined) =>
  typeof value === 'number' ? (total ?? 0) + value : total;

/** The player's lines of the matches no source disputes, each match once, and the MVPs among them. */
export function careerOf(board: Board, name: string): Career {
  const index = matchIndex(board.results, board.matchRosters ?? []);
  const lines = new Map(
    board.results
      .filter((row) => row.name === name && row.kind === 'match' && !row.review_required)
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
  };
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
  }
  return career;
}
