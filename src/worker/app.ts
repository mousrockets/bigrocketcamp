import { Hono } from 'hono';
import { type AppEnv, requireMember } from './auth';
import { authRoutes } from './routes/auth';
import { epicRoutes } from './routes/epic';
import { exerciseRoutes, reactionRoutes } from './routes/exercises';
import { identityRoutes } from './routes/identities';
import { importRoutes } from './routes/imports';
import { liveRoutes } from './routes/live';
import { monthlyRoutes } from './routes/monthly';
import { rankRoutes } from './routes/ranks';
import { stateRoutes } from './routes/state';

export const app = new Hono<AppEnv>().basePath('/api');

app.get('/health', (c) => c.json({ status: 'ok' }));
app.route('/auth', authRoutes);
app.route('/', importRoutes);
app.route('/ranks', rankRoutes);

// Everything below needs a signed-in member.
app.use('/state', requireMember);
app.use('/exercise', requireMember);
app.use('/reaction', requireMember);
app.use('/identities', requireMember);
app.use('/live', requireMember);
app.use('/monthly', requireMember);
app.use('/epic', requireMember);

app.route('/state', stateRoutes);
app.route('/exercise', exerciseRoutes);
app.route('/reaction', reactionRoutes);
app.route('/identities', identityRoutes);
app.route('/live', liveRoutes);
app.route('/monthly', monthlyRoutes);
app.route('/epic', epicRoutes);
