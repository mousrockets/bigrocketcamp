import { Hono } from 'hono';
import { type AppEnv, sameOrigin } from '../auth';
import {
  createPairingCode,
  listCollectors,
  pairCollector,
  readCollectorPlayer,
  requireCollector,
  revokeCollector,
} from '../collectors';
import { failure, noStore, smallJson } from '../respond';

/** What the Windows collector calls: pairing without a session, then its own token. */
export const collectorRoutes = new Hono<AppEnv>();

collectorRoutes.post('/pair', async (c) => {
  try {
    const body = await smallJson(c, 200);
    return c.json(await pairCollector(c.env.DB, body?.code), 200, noStore);
  } catch (error) {
    return failure(c, error, 'Association impossible.');
  }
});

collectorRoutes.get('/status', requireCollector, async (c) =>
  c.json({ player: await readCollectorPlayer(c.env.DB, c.var.member.id) }, 200, noStore),
);

/** What the member manages from their profile: pairing codes and paired collectors. */
export const collectorDeviceRoutes = new Hono<AppEnv>();

collectorDeviceRoutes.get('/', async (c) =>
  c.json({ devices: await listCollectors(c.env.DB, c.var.member.id) }, 200, noStore),
);

collectorDeviceRoutes.post('/', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'Origine refusée.' }, 403, noStore);
  try {
    return c.json(await createPairingCode(c.env.DB, c.var.member.id), 201, noStore);
  } catch (error) {
    return failure(c, error, 'Code impossible à créer.');
  }
});

collectorDeviceRoutes.delete('/', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'Origine refusée.' }, 403, noStore);
  try {
    await revokeCollector(c.env.DB, c.var.member.id, (await smallJson(c))?.id);
    return c.body(null, 204);
  } catch (error) {
    return failure(c, error, 'Révocation impossible.');
  }
});
