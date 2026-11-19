import { and, count, eq, isNotNull, ne } from 'drizzle-orm';
import type { SoundCollections, SoundDrawn } from './contract';
import type { Database } from './db';
import { orm } from './orm';
import { exercises, members, soundDraws } from './schema';
import { drawSound, soundIds } from './sounds';

// The sound badges. The app asks for a draw when one of the member's own series clears their debt; the member's
// word is enough, as it is for the series itself. A series draws once: asking again answers the same sound.

/** A draw is asked right after the series; one sent much later is no longer a celebration. */
const drawWindowMs = 60 * 60 * 1000;

const withStatus = (message: string, status: number) => Object.assign(new Error(message), { status });

export async function drawSoundFor(db: Database, memberId: string, exerciseId: string): Promise<SoundDrawn> {
  const query = orm(db);
  const [series] = await query
    .select({ created: exercises.created })
    .from(exercises)
    .innerJoin(members, and(eq(members.id, exercises.author), eq(members.duoPseudo, exercises.player)))
    .where(and(eq(exercises.id, exerciseId), eq(exercises.author, memberId)));
  if (!series) throw withStatus('Série introuvable.', 404);
  if (Date.now() - Date.parse(series.created) > drawWindowMs) throw withStatus('Ce tirage est passé.', 403);

  await query.insert(soundDraws).values({ exerciseId, memberId, sound: drawSound() }).onConflictDoNothing();
  const [drawn] = await query
    .select({ sound: soundDraws.sound })
    .from(soundDraws)
    .where(eq(soundDraws.exerciseId, exerciseId));
  if (!drawn) throw withStatus('Série introuvable.', 404);
  const before = await query.$count(
    soundDraws,
    and(eq(soundDraws.memberId, memberId), eq(soundDraws.sound, drawn.sound), ne(soundDraws.exerciseId, exerciseId)),
  );
  return { sound: known(drawn.sound), unlocked: before === 0 };
}

/** Every player's badges, with how many times each sound was drawn. */
export async function readSoundCollections(db: Database): Promise<SoundCollections> {
  const rows = await orm(db)
    .select({ player: members.duoPseudo, sound: soundDraws.sound, count: count() })
    .from(soundDraws)
    .innerJoin(members, eq(members.id, soundDraws.memberId))
    .where(isNotNull(members.duoPseudo))
    .groupBy(members.duoPseudo, soundDraws.sound);
  const collections = new Map<string, SoundCollections['collections'][number]>();
  for (const { player, sound, count } of rows) {
    if (player === null) continue;
    const collection = collections.get(player) ?? { player, badges: [] };
    collection.badges.push({ sound: known(sound), count });
    collections.set(player, collection);
  }
  return { collections: [...collections.values()] };
}

const known = (sound: string) => soundIds.find((id) => id === sound) ?? null;
