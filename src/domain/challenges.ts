export const exerciseKinds = ['pushups', 'crunches', 'plank'] as const;
export type ExerciseKind = (typeof exerciseKinds)[number];

/** Repetitions, or whole seconds for the plank. */
export interface Exercise {
  kind: ExerciseKind;
  amount: number;
}

// The pushup is the unit of every challenge. Counting the plank in whole seconds keeps every credit exact.
const pushupsPerUnit: Record<ExerciseKind, number> = { pushups: 1, crunches: 0.5, plank: 0.25 };
const largestAmount: Record<ExerciseKind, number> = { pushups: 10_000, crunches: 10_000, plank: 60_000 };

export function isValidExercise({ kind, amount }: Exercise): boolean {
  return Number.isSafeInteger(amount) && amount > 0 && amount <= largestAmount[kind];
}

export function pushupsFor({ kind, amount }: Exercise): number {
  return amount * pushupsPerUnit[kind];
}

export interface ChallengeRules {
  pushupsPerLoss: number;
  lastPlace: {
    enabled: boolean;
    pushups: number;
    /** With `none`, a shared last place costs nothing extra. */
    ties: 'none' | 'all';
  };
}

export const defaultRules: ChallengeRules = {
  pushupsPerLoss: 5,
  lastPlace: { enabled: false, pushups: 5, ties: 'none' },
};

export type Team = 0 | 1;

export interface Scoreboard {
  winner: Team;
  players: { playerId: string; team: Team; score: number }[];
  /** False when a player left or the board is partial: nobody can then be ranked last. */
  complete: boolean;
}

export function pushupsOwed(scoreboard: Scoreboard, playerId: string, rules: ChallengeRules): number {
  const player = scoreboard.players.find((candidate) => candidate.playerId === playerId);
  if (!player || player.team === scoreboard.winner) return 0;
  return rules.pushupsPerLoss + (finishedLast(scoreboard, player.score, rules) ? rules.lastPlace.pushups : 0);
}

function finishedLast(scoreboard: Scoreboard, score: number, rules: ChallengeRules): boolean {
  if (!rules.lastPlace.enabled || !scoreboard.complete) return false;
  const lowest = Math.min(...scoreboard.players.map((player) => player.score));
  const sharedBy = scoreboard.players.filter((player) => player.score === lowest).length;
  return score === lowest && (sharedBy === 1 || rules.lastPlace.ties === 'all');
}

/** Extra pushups are not lost: they count against the next losses. */
export function balance(owed: number, done: number): { remaining: number; ahead: number } {
  return { remaining: Math.max(0, owed - done), ahead: Math.max(0, done - owed) };
}

/** What one exercise changes, as told to the player right after declaring it. */
export function exerciseEffect(remaining: number, exercise: Exercise) {
  const equivalent = pushupsFor(exercise);
  return {
    equivalent,
    reduction: Math.min(remaining, equivalent),
    remaining: Math.max(0, remaining - equivalent),
    excess: Math.max(0, equivalent - remaining),
  };
}
