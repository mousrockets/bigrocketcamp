import { createContext, type ReactNode, useContext, useState } from 'react';
import type { LastPlaceRules } from '../lib/match-rules';
import { useBoard } from './board-client';
import { useClub } from './club';

// The board: every result, exercise and rank of the club, kept in sync by board-client.ts. The tabs share one copy,
// held by the app shell, so moving between them neither reloads it nor opens a second connection.

export type ExerciseType = 'pushups' | 'plank' | 'crunches';

export interface BoardExercise {
  id: string;
  player: string;
  type: ExerciseType;
  count: number;
  day: string;
  created: string;
  mine?: boolean;
}

export interface BoardResult {
  match_guid: string;
  player_id: string;
  name: string;
  day: string;
  kind: string;
  team: number;
  winner: number;
  score: number;
  goals?: number;
  received?: string;
  review_required?: boolean;
  verification?: string;
  selected_source?: string;
}

export interface SeasonPeak {
  mmr: number;
  label: string;
  tier: number | null;
}

export interface SoloRank {
  mmr: number | null;
  label: string;
  tier: number | null;
  matchesPlayed: number | null;
  status: string;
  fetchedAt: string | null;
  peak: SeasonPeak | null;
}

export interface DoublesRank {
  player: string;
  mmr: number | null;
  label: string;
  tier: number | null;
  matchesPlayed: number | null;
  status: string;
  fetchedAt: string | null;
  /** Absent from an API older than the season peaks. */
  peak?: SeasonPeak | null;
  solo?: SoloRank | null;
}

export interface Board {
  results: BoardResult[];
  exercises: BoardExercise[];
  collectors: { last_seen: string }[];
  matchRosters?: { match_guid: string; expected_players: number }[];
  doublesRanks?: DoublesRank[];
  reactions?: { exercise_id: string; emoji: string; count: number; mine: number }[];
  rankSource?: { lastReadAt: string | null; stale: boolean } | null;
  rules?: { lastPlace: LastPlaceRules };
}

export interface BoardState {
  /** Null until the first copy arrives, from the browser or the API. */
  board: Board | null;
  /** Why the last update failed; empty while the board follows the club live. */
  error: string;
  /** Reads what changed at once, after a write. */
  refresh: () => Promise<Board | null>;
}

export const BoardContext = createContext<BoardState | null>(null);

export function BoardProvider({ children }: { children: ReactNode }) {
  const { roster } = useClub();
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState('');
  const refresh = useBoard<Board>(roster, setBoard, setError);
  return <BoardContext value={{ board, error, refresh }}>{children}</BoardContext>;
}

export function useBoardState(): BoardState {
  const state = useContext(BoardContext);
  if (!state) throw new Error('useBoardState needs the app shell.');
  return state;
}
