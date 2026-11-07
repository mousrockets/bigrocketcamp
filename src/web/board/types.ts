import type { LastPlaceRules } from '../../lib/match-rules';
import type { MonthlyState } from '../monthly-mmr';

// The board as the API sends it (GET /api/state), read by every page through the board context.

export type ExerciseType = 'pushups' | 'plank' | 'crunches';
export type Declaration = { id: string; player: string; type: ExerciseType; count: number; day: string };
export type Exercise = Declaration & { created: string; mine?: boolean };
export type Result = {
  match_guid: string;
  player_id: string;
  name: string;
  day: string;
  kind: string;
  team: number;
  winner: number;
  score: number;
  goals?: number;
  assists?: number;
  saves?: number;
  received?: string;
  review_required?: boolean;
  verification?: string;
  selected_source?: string;
};
export type PlayerStats = {
  name: string;
  played: number;
  wins: number;
  losses: number;
  due: number;
  done: number;
  pushups: number;
  plankSeconds: number;
  crunches: number;
  remaining: number;
};
export type SeasonPeak = { mmr: number; label: string; tier: number | null };
export type SoloRank = {
  mmr: number | null;
  label: string;
  tier: number | null;
  matchesPlayed: number | null;
  status: string;
  fetchedAt: string | null;
  peak: SeasonPeak | null;
};
export type DoublesRank = {
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
};
export type Reaction = { exercise_id: string; emoji: string; count: number; mine: number };
export type BoardState = {
  results: Result[];
  exercises: Exercise[];
  collectors: { last_seen: string }[];
  matchRosters?: { match_guid: string; expected_players: number }[];
  reliability?: { confirmed: number; single: number; corrected: number; review: number };
  doublesRanks?: DoublesRank[];
  reactions?: Reaction[];
  me?: string | null;
  monthly?: MonthlyState;
  rankSource?: { lastReadAt: string | null; stale: boolean } | null;
  rules?: { lastPlace: LastPlaceRules };
};
export type Streak = { current: number; best: number };
