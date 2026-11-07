import { exerciseInput } from '../domain';
import { says, z } from '../validation';

// Declaring an exercise, undoing it, reacting to it. Each answers `done`.

export { exerciseInput };
export type ExerciseInput = z.input<typeof exerciseInput>;

export const invalidExercise = 'Déclaration invalide.';

const exerciseId = /^[a-zA-Z0-9-]{16,80}$/;
export const unknownExercise = 'Série inconnue.';
export const exerciseToUndo = z.object({
  id: z.string(says(unknownExercise)).regex(exerciseId, says(unknownExercise)),
});
export type ExerciseToUndo = z.input<typeof exerciseToUndo>;

export const invalidReaction = 'Réaction invalide.';
export const reaction = z.object({
  exerciseId: z.string(says(invalidReaction)).regex(exerciseId, says(invalidReaction)),
  emoji: z.enum(['💪', '🔥', '😂'], says(invalidReaction)),
});
export type ReactionInput = z.input<typeof reaction>;
