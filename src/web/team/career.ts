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
}

/** The player's lines of the matches no source disputes, each match once, and the MVPs among them. */
export function careerOf(board: Board, name: string): Career {
  const index = matchIndex(board.results, board.matchRosters ?? []);
  const lines = new Map(
    board.results
      .filter((row) => row.name === name && row.kind === 'match' && !row.review_required)
      .map((row) => [row.match_guid, row]),
  );
  const career: Career = { matches: 0, wins: 0, losses: 0, goals: 0, assists: 0, saves: 0, mvps: 0 };
  for (const [guid, row] of lines) {
    // A player who left lost the match, whatever his team did after.
    const won = !row.left && row.team === row.winner;
    career.matches++;
    career[won ? 'wins' : 'losses']++;
    career.goals += row.goals;
    career.assists += row.assists;
    career.saves += row.saves;
    if (!row.left && mvpOf(index.get(guid)) === row.player_id) career.mvps++;
  }
  return career;
}
