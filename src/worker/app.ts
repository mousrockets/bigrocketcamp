import { Hono } from 'hono';
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

// Which build answers, and since when: the web app reloads itself when it no longer matches.
app.get('/health', (c) =>
  c.json(
    { status: 'ok', commit: __APP_COMMIT__, deployedAt: isoDate(c.env.CF_VERSION_METADATA.timestamp) },
    200,
    noStore,
  ),
);
app.route('/auth', authRoutes);
app.route('/ranks', rankRoutes);
app.route('/club/name', clubNameRoutes);
// Anyone reads the logo; changing it checks the member inside its routes.
app.route('/club/logo', clubLogoRoutes);
// The Windows collector pairs with a code and then sends its own token: no session.
app.route('/collector', collectorRoutes);

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

app.route('/state', stateRoutes);
app.route('/exercise', exerciseRoutes);
app.route('/reaction', reactionRoutes);
app.route('/identities', identityRoutes);
app.route('/live', liveRoutes);
app.route('/monthly', monthlyRoutes);
app.route('/club/rules', clubRuleRoutes);
app.route('/club', clubRoutes);
app.route('/profile', profileRoutes);
app.route('/collectors', collectorDeviceRoutes);
app.route('/members', memberRoutes);
