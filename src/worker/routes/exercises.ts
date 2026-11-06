import { Hono } from 'hono';
import { readRoster } from '../../lib/club';
import { parisDay, validateExercise } from '../../lib/domain';
import { type AppEnv, sameOrigin } from '../auth';

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
    const db = c.env.DB;
    await db
      .prepare(
        'INSERT INTO exercises (id, player, count, day, created, author, type) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
      )
      .bind(
        exercise.id,
        exercise.player,
        exercise.count,
        exercise.day,
        new Date().toISOString(),
        c.var.member.id,
        exercise.type,
      )
      .run();
    // The id is chosen by the client so that a retry never counts twice; a different exercise under it is a conflict.
    const saved = await db
      .prepare('SELECT player, count, day, type FROM exercises WHERE id = ?')
      .bind(exercise.id)
      .first<{ player: string; count: number; day: string; type: string }>();
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
    return c.json({ error: error instanceof Error ? error.message : 'Déclaration invalide.' }, 400);
  }
});

exerciseRoutes.delete('/', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'Origine refusée.' }, 403);
  const body = (await smallJson(c.req.text())) as { id?: unknown } | null;
  const id = body?.id;
  if (typeof id !== 'string' || !exerciseId.test(id)) return c.json({ error: 'Série inconnue.' }, 400);
  const db = c.env.DB;
  const saved = await db
    .prepare('SELECT author, created FROM exercises WHERE id = ?')
    .bind(id)
    .first<{ author: string; created: string }>();
  if (!saved) return c.json({ error: 'Série introuvable.' }, 404);
  if (saved.author !== c.var.member.id) return c.json({ error: 'Seul l’auteur peut annuler cette série.' }, 403);
  if (Date.now() - Date.parse(saved.created) > undoWindow) {
    return c.json({ error: 'Une série ne peut être annulée que dans les 24 heures.' }, 403);
  }
  await db.batch([
    db.prepare('DELETE FROM exercise_reactions WHERE exercise_id = ?').bind(id),
    db.prepare('DELETE FROM exercises WHERE id = ? AND author = ?').bind(id, c.var.member.id),
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
  const db = c.env.DB;
  if (!(await db.prepare('SELECT 1 FROM exercises WHERE id = ?').bind(id).first())) {
    return c.json({ error: 'Série introuvable.' }, 404);
  }
  // A second tap on the same emoji takes the reaction back.
  const removed = await db
    .prepare('DELETE FROM exercise_reactions WHERE exercise_id = ? AND author = ? AND emoji = ?')
    .bind(id, c.var.member.id, emoji)
    .run();
  if (!removed.meta.changes) {
    await db
      .prepare(
        'INSERT INTO exercise_reactions (exercise_id, author, emoji, created) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
      )
      .bind(id, c.var.member.id, emoji, new Date().toISOString())
      .run();
  }
  return c.json({ ok: true });
});
