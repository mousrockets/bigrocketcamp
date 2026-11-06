import { Hono } from 'hono';
import { type AppEnv, closeSession, normalizeEmail, sameOrigin, sendSignInCode, verifySignInCode } from '../auth';

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/code', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'Origine refusée.' }, 403);
  const body = await c.req.json<{ email?: unknown }>().catch(() => ({ email: undefined }));
  const email = normalizeEmail(body.email);
  if (!email) return c.json({ error: 'Adresse e-mail invalide.' }, 400);
  const outcome = await sendSignInCode(c.env, email, c.req.url);
  if (outcome === 'too-soon') return c.json({ error: 'Un code vient d’être envoyé. Réessaie dans une minute.' }, 429);
  return c.body(null, 204);
});

authRoutes.post('/verify', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'Origine refusée.' }, 403);
  const body = await c.req
    .json<{ email?: unknown; code?: unknown }>()
    .catch(() => ({ email: undefined, code: undefined }));
  const email = normalizeEmail(body.email);
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  if (!email || !/^\d{6}$/.test(code)) return c.json({ error: 'Code invalide.' }, 400);
  if (!(await verifySignInCode(c, email, code))) return c.json({ error: 'Code incorrect ou expiré.' }, 401);
  return c.body(null, 204);
});

authRoutes.post('/logout', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'Origine refusée.' }, 403);
  await closeSession(c);
  return c.body(null, 204);
});
