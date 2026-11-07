import { Hono } from 'hono';
import type { Health } from '../lib/contract';
import { isoDate } from '../lib/version';
import { type AppEnv, requireAdmin, requireMember } from './auth';
import { requireMemberOrCollector } from './collectors';
import { noStore } from './respond';
import { authRoutes } from './routes/auth';
import { clubLogoRoutes, clubNameRoutes, clubRoutes, clubRuleRoutes } from './routes/club';
import { collectorDeviceRoutes, collectorRoutes } from './routes/collector';
import { exerciseRoutes, reactionRoutes } from './routes/exercises';
import { identityRoutes } from './routes/identities';
import { liveRoutes } from './routes/live';
import { memberRoutes } from './routes/members';
import { monthlyRoutes } from './routes/monthly';
import { profileRoutes } from './routes/profile';
import { rankRoutes } from './routes/ranks';
import { stateRoutes } from './routes/state';

export const app = new Hono<AppEnv>().basePath('/api');

// What no route expected: the member gets a message to retry, the logs get the error's name only.
app.onError((error, c) => {
  console.error('unexpected error', error.name);
  return c.json({ error: 'Une erreur est survenue. Réessaie dans un instant.' }, 500, noStore);
});

// The routes are chained so that their types add up into `AppType`, which the web app's client is typed from.
// Hono runs handlers in the order they are added: the public routes come before the middlewares below.
const publicRoutes = app
  // Which build answers, and since when: the web app reloads itself when it no longer matches.
  .get('/health', (c) =>
    c.json(
      {
        status: 'ok',
        commit: __APP_COMMIT__,
        deployedAt: isoDate(c.env.CF_VERSION_METADATA.timestamp),
      } satisfies Health,
      200,
      noStore,
    ),
  )
  .route('/auth', authRoutes)
  .route('/ranks', rankRoutes)
  .route('/club/name', clubNameRoutes)
  // Anyone reads the logo; changing it checks the member inside its routes.
  .route('/club/logo', clubLogoRoutes)
  // The Windows collector pairs with a code and then sends its own token: no session.
  .route('/collector', collectorRoutes);

// Everything below needs a signed-in member.
app.use('/state', requireMember);
app.use('/exercise', requireMember);
app.use('/reaction', requireMember);
app.use('/identities', requireMember);
app.use('/live', requireMemberOrCollector);
app.use('/monthly', requireMember);
app.use('/club', requireMember);
app.use('/club/rules', requireMember);
app.use('/profile', requireMember);
app.use('/collectors', requireMember);
app.use('/members', requireMember, requireAdmin);

const routes = publicRoutes
  .route('/state', stateRoutes)
  .route('/exercise', exerciseRoutes)
  .route('/reaction', reactionRoutes)
  .route('/identities', identityRoutes)
  .route('/live', liveRoutes)
  .route('/monthly', monthlyRoutes)
  .route('/club/rules', clubRuleRoutes)
  .route('/club', clubRoutes)
  .route('/profile', profileRoutes)
  .route('/collectors', collectorDeviceRoutes)
  .route('/members', memberRoutes);

/** Every route of the API with its inputs and answers: what `hc` types the web app's client from. */
export type AppType = typeof routes;
