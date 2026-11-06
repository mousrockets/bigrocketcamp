import { Hono } from 'hono';
import { type AppEnv, requireAdmin, requireMember } from './auth';
import { requireMemberOrCollector } from './collectors';
import { noStore } from './respond';
import { authRoutes } from './routes/auth';
import { clubNameRoutes, clubRoutes } from './routes/club';
import { collectorDeviceRoutes, collectorRoutes } from './routes/collector';
import { epicRoutes } from './routes/epic';
import { exerciseRoutes, reactionRoutes } from './routes/exercises';
import { identityRoutes } from './routes/identities';
import { importRoutes } from './routes/imports';
import { liveRoutes } from './routes/live';
import { memberRoutes } from './routes/members';
import { monthlyRoutes } from './routes/monthly';
import { profileRoutes } from './routes/profile';
import { rankRoutes } from './routes/ranks';
import { stateRoutes } from './routes/state';

export const app = new Hono<AppEnv>().basePath('/api');

// Which build answers, and since when: the web app reloads itself when it no longer matches.
app.get('/health', (c) =>
  c.json(
    { status: 'ok', commit: __APP_COMMIT__, deployedAt: c.env.CF_VERSION_METADATA.timestamp || null },
    200,
    noStore,
  ),
);
app.route('/auth', authRoutes);
app.route('/', importRoutes);
app.route('/ranks', rankRoutes);
app.route('/club/name', clubNameRoutes);
// The Windows collector pairs with a code and then sends its own token: no session.
app.route('/collector', collectorRoutes);

// Everything below needs a signed-in member.
app.use('/state', requireMember);
app.use('/exercise', requireMember);
app.use('/reaction', requireMember);
app.use('/identities', requireMember);
app.use('/live', requireMemberOrCollector);
app.use('/monthly', requireMember);
app.use('/epic', requireMember);
app.use('/club', requireMember);
app.use('/profile', requireMember);
app.use('/collectors', requireMember);
app.use('/members', requireMember, requireAdmin);

app.route('/state', stateRoutes);
app.route('/exercise', exerciseRoutes);
app.route('/reaction', reactionRoutes);
app.route('/identities', identityRoutes);
app.route('/live', liveRoutes);
app.route('/monthly', monthlyRoutes);
app.route('/epic', epicRoutes);
app.route('/club', clubRoutes);
app.route('/profile', profileRoutes);
app.route('/collectors', collectorDeviceRoutes);
app.route('/members', memberRoutes);
