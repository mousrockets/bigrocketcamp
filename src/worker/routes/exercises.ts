import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { readRoster } from '../../lib/club';
import { exerciseInput, parisDay } from '../../lib/domain';
import { orm } from '../../lib/orm';
import { exerciseReactions, exercises } from '../../lib/schema';
import { type AppEnv, sameOriginOnly } from '../auth';
import { exerciseToUndo, invalidReaction, reaction, unknownExercise } from '../inputs';
import { failure } from '../respond';
import { jsonBody } from '../validate';

const invalidExercise = 'Déclaration invalide.';

export const exerciseRoutes = new Hono<AppEnv>();
export const reactionRoutes = new Hono<AppEnv>();

const undoWindow = 24 * 60 * 60 * 1000;

exerciseRoutes.use(sameOriginOnly);
reactionRoutes.use(sameOriginOnly);

exerciseRoutes.post('/', ...jsonBody(exerciseInput, { invalid: invalidExercise }), async (c) => {
  try {
    const exercise = c.req.valid('json');
    if (!(await readRoster(c.env.DB)).includes(exercise.player)) throw new Error(invalidExercise);
    if (exercise.day > parisDay()) throw new Error('La déclaration ne peut pas être datée dans le futur.');
    const db = orm(c.env.DB);
    await db
      .insert(exercises)
      .values({
        id: exercise.id,
        player: exercise.player,
        type: exercise.type,
        count: exercise.count,
        day: exercise.day,
        created: new Date().toISOString(),
        author: c.var.member.id,
      })
      .onConflictDoNothing({ target: exercises.id });
    // The id is chosen by the client so that a retry never counts twice; a different exercise under it is a conflict.
    const [saved] = await db
      .select({ player: exercises.player, count: exercises.count, day: exercises.day, type: exercises.type })
      .from(exercises)
      .where(eq(exercises.id, exercise.id));
    if (
      !saved ||
      saved.player !== exercise.player ||
      saved.count !== exercise.count ||
      saved.day !== exercise.day ||
      saved.type !== exercise.type
    ) {
      return c.json({ error: 'Identifiant déjà utilisé.' }, 409);
    }
    return c.json({ ok: true });
  } catch (error) {
    return failure(c, error, invalidExercise);
  }
});

exerciseRoutes.delete('/', ...jsonBody(exerciseToUndo, { invalid: unknownExercise }), async (c) => {
  const { id } = c.req.valid('json');
  const db = orm(c.env.DB);
  const [saved] = await db
    .select({ author: exercises.author, created: exercises.created })
    .from(exercises)
    .where(eq(exercises.id, id));
  if (!saved) return c.json({ error: 'Série introuvable.' }, 404);
  if (saved.author !== c.var.member.id) return c.json({ error: 'Seul l’auteur peut annuler cette série.' }, 403);
  if (Date.now() - Date.parse(saved.created) > undoWindow) {
    return c.json({ error: 'Une série ne peut être annulée que dans les 24 heures.' }, 403);
  }
  // Its reactions go with it (foreign key, ON DELETE CASCADE).
  await db.delete(exercises).where(and(eq(exercises.id, id), eq(exercises.author, c.var.member.id)));
  return c.json({ ok: true });
});

reactionRoutes.post('/', ...jsonBody(reaction, { invalid: invalidReaction }), async (c) => {
  const { exerciseId: id, emoji } = c.req.valid('json');
  const db = orm(c.env.DB);
  if (!(await db.$count(exercises, eq(exercises.id, id)))) return c.json({ error: 'Série introuvable.' }, 404);
  // A second tap on the same emoji takes the reaction back.
  const mine = and(
    eq(exerciseReactions.exerciseId, id),
    eq(exerciseReactions.author, c.var.member.id),
    eq(exerciseReactions.emoji, emoji),
  );
  const removed = await db.delete(exerciseReactions).where(mine).returning({ emoji: exerciseReactions.emoji });
  if (!removed.length) {
    await db
      .insert(exerciseReactions)
      .values({ exerciseId: id, author: c.var.member.id, emoji, created: new Date().toISOString() })
      .onConflictDoNothing();
  }
  return c.json({ ok: true });
});
