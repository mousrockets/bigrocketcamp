import { Hono } from 'hono';
import { invalidPlaySession, type PlaySessionAnswer, playSessionAction } from '../../lib/contract';
import { startPlaySession, stopPlaySession } from '../../lib/play-session';
import { type AppEnv, sameOriginOnly } from '../auth';
import { failure, noStore } from '../respond';
import { jsonBody } from '../validate';

// The member starts or stops their own play session; the board shows it to the club.
export const playSessionRoutes = new Hono<AppEnv>().post(
  '/',
  sameOriginOnly,
  ...jsonBody(playSessionAction, { invalid: invalidPlaySession }),
  async (c) => {
    try {
      const { id } = c.var.member;
      if (c.req.valid('json').action === 'stop') {
        await stopPlaySession(c.env.DB, id);
        return c.json({ session: null } satisfies PlaySessionAnswer, 200, noStore);
      }
      const session = await startPlaySession(c.env.DB, id);
      return c.json({ session } satisfies PlaySessionAnswer, 200, noStore);
    } catch (error) {
      return failure(c, error, invalidPlaySession);
    }
  },
);
