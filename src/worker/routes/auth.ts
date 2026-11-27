import { Hono } from 'hono';
import { invalidCode, invalidEmail, type SignInCodeShown, signInCode, signInEmail } from '../../lib/contract';
import { type AppEnv, closeSession, sameOriginOnly, sendSignInCode, verifySignInCode } from '../auth';
import { jsonBody } from '../validate';

export const authRoutes = new Hono<AppEnv>()
  .use(sameOriginOnly)
  .post('/code', ...jsonBody(signInEmail, { invalid: invalidEmail }), async (c) => {
    const shown = await sendSignInCode(c.env, c.req.valid('json').email, c.req.url);
    if (shown) return c.json({ devCode: shown } satisfies SignInCodeShown, 200, { 'Cache-Control': 'no-store' });
    return c.body(null, 204);
  })
  .post('/verify', ...jsonBody(signInCode, { invalid: invalidCode }), async (c) => {
    const { email, code } = c.req.valid('json');
    if (!(await verifySignInCode(c, email, code))) return c.json({ error: 'Code incorrect ou expiré.' }, 401);
    return c.body(null, 204);
  })
  .post('/logout', async (c) => {
    await closeSession(c);
    return c.body(null, 204);
  });
