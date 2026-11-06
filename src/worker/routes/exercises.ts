import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { readRoster } from '../../lib/club';
import { parisDay, validateExercise } from '../../lib/domain';
import { orm } from '../../lib/orm';
import { exerciseReactions, exercises } from '../../lib/schema';
import { type AppEnv, sameOrigin } from '../auth';
import { failure } from '../respond';

export const exerciseRoutes = new Hono<AppEnv>();
export const reactionRoutes = new Hono<AppEnv>();

const exerciseId = /^[a-zA-Z0-9-]{16,80}$/;
const undoWindow = 24 * 60 * 60 * 1000;
const reactionEmojis = ['💪', '🔥', '😂'];

async function smallJson(text: Promise<string>): Promise<unknown> {
  const input = await text;
  if (input.length > 2000) return null;
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

exerciseRoutes.post('/', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'Origine refusée.' }, 403);
  try {
    const input = await c.req.text();
    if (input.length > 2000) throw new Error('Déclaration invalide.');
    const exercise = validateExercise(await readRoster(c.env.DB), JSON.parse(input));
    if (exercise.day > parisDay()) throw new Error('La déclaration ne peut pas être datée dans le futur.');
    const db = orm(c.env.DB);
    await db
      .insert(exercises)
      .values({ ...exercise, created: new Date().toISOString(), author: c.var.member.id })
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
    return failure(c, error, 'Déclaration invalide.');
  }
});

exerciseRoutes.delete('/', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'Origine refusée.' }, 403);
  const body = (await smallJson(c.req.text())) as { id?: unknown } | null;
  const id = body?.id;
  if (typeof id !== 'string' || !exerciseId.test(id)) return c.json({ error: 'Série inconnue.' }, 400);
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
  await db.batch([
    db.delete(exerciseReactions).where(eq(exerciseReactions.exerciseId, id)),
    db.delete(exercises).where(and(eq(exercises.id, id), eq(exercises.author, c.var.member.id))),
  ]);
  return c.json({ ok: true });
});

reactionRoutes.post('/', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'Origine refusée.' }, 403);
  const body = (await smallJson(c.req.text())) as { exerciseId?: unknown; emoji?: unknown } | null;
  const id = body?.exerciseId;
  const emoji = body?.emoji;
  if (typeof id !== 'string' || !exerciseId.test(id) || typeof emoji !== 'string' || !reactionEmojis.includes(emoji)) {
    return c.json({ error: 'Réaction invalide.' }, 400);
  }
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
