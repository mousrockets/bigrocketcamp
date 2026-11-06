import { Hono } from 'hono';
import { type AppEnv, sameOriginOnly } from '../auth';
import {
  createPairingCode,
  listCollectors,
  pairCollector,
  readCollectorPlayer,
  requireCollector,
  revokeCollector,
} from '../collectors';
import { collectorToRevoke, invalidPairingCode, pairingCode, unknownCollector } from '../inputs';
import { failure, noStore } from '../respond';
import { jsonBody } from '../validate';

/** What the Windows collector calls: pairing without a session, then its own token. */
export const collectorRoutes = new Hono<AppEnv>();

collectorRoutes.post('/pair', ...jsonBody(pairingCode, { invalid: invalidPairingCode, maxLength: 200 }), async (c) => {
  try {
    return c.json(await pairCollector(c.env.DB, c.req.valid('json').code), 200, noStore);
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

collectorDeviceRoutes.post('/', sameOriginOnly, async (c) => {
  try {
    return c.json(await createPairingCode(c.env.DB, c.var.member.id), 201, noStore);
  } catch (error) {
    return failure(c, error, 'Code impossible à créer.');
  }
});

collectorDeviceRoutes.delete(
  '/',
  sameOriginOnly,
  ...jsonBody(collectorToRevoke, { invalid: unknownCollector }),
  async (c) => {
    try {
      await revokeCollector(c.env.DB, c.var.member.id, c.req.valid('json').id);
      return c.body(null, 204);
    } catch (error) {
      return failure(c, error, 'Révocation impossible.');
    }
  },
);
