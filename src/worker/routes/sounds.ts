import { Hono } from 'hono';
import { invalidSoundDraw, type SoundCollections, type SoundDrawn, soundDrawInput } from '../../lib/contract';
import { drawSoundFor, readSoundCollections } from '../../lib/sound-badges';
import { type AppEnv, sameOriginOnly } from '../auth';
import { failure, noStore } from '../respond';
import { jsonBody } from '../validate';

export const soundRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json((await readSoundCollections(c.env.DB)) satisfies SoundCollections, 200, noStore))
  .post('/', sameOriginOnly, ...jsonBody(soundDrawInput, { invalid: invalidSoundDraw }), async (c) => {
    try {
      const drawn = await drawSoundFor(c.env.DB, c.var.member.id, c.req.valid('json').exerciseId);
      return c.json(drawn satisfies SoundDrawn, 200, noStore);
    } catch (error) {
      return failure(c, error, invalidSoundDraw);
    }
  });
