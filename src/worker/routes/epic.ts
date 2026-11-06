import { Hono } from 'hono';
import { readRoster } from '../../lib/club';
import { autoSync, connectionStatus, disconnect, retiredReason, syncHistories } from '../../lib/epic-sync';
import { type AppEnv, sameOrigin } from '../auth';

// The community Epic connection is retired. These routes keep old tabs and installed apps working.
export const epicRoutes = new Hono<AppEnv>();

const noStore = { 'Cache-Control': 'no-store' };

epicRoutes.get('/', async (c) =>
  c.json(await connectionStatus(c.env, await readRoster(c.env.DB), c.var.member.id), 200, noStore),
);

epicRoutes.post('/', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'Origine refusée.' }, 403);
  try {
    const input = await c.req.text();
    if (input.length > 2000) throw new Error('Demande invalide.');
    const { action, slot } = JSON.parse(input);
    if (action === 'start' || action === 'poll') return c.json({ error: retiredReason, retired: true }, 410, noStore);
    if (action === 'disconnect')
      return c.json(await disconnect(c.env, await readRoster(c.env.DB), c.var.member.id, slot), 200, noStore);
    if (action === 'sync') return c.json(await syncHistories(c.env, c.var.member.id), 200, noStore);
    if (action === 'auto') return c.json(await autoSync(c.env), 200, noStore);
    throw new Error('Action inconnue.');
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Service Epic indisponible. Réessaie plus tard.' },
      400,
      noStore,
    );
  }
});
