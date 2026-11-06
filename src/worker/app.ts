import { Hono } from 'hono';
import { type AppEnv, requireAdmin, requireMember } from './auth';
import { authRoutes } from './routes/auth';
import { clubNameRoutes, clubRoutes } from './routes/club';
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

app.get('/health', (c) => c.json({ status: 'ok' }));
app.route('/auth', authRoutes);
app.route('/', importRoutes);
app.route('/ranks', rankRoutes);
app.route('/club/name', clubNameRoutes);

// Everything below needs a signed-in member.
app.use('/state', requireMember);
app.use('/exercise', requireMember);
app.use('/reaction', requireMember);
app.use('/identities', requireMember);
app.use('/live', requireMember);
app.use('/monthly', requireMember);
app.use('/epic', requireMember);
app.use('/club', requireMember);
app.use('/profile', requireMember);
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
app.route('/members', memberRoutes);
