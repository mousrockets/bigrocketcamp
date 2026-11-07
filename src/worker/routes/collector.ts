import { Hono } from 'hono';
import {
  type CollectorDevices,
  type CollectorPairing,
  type CollectorStatus,
  collectorToRevoke,
  invalidPairingCode,
  type PairingCodeCreated,
  pairingCode,
  unknownCollector,
} from '../../lib/contract';
import { type AppEnv, sameOriginOnly } from '../auth';
import {
  createPairingCode,
  listCollectors,
  pairCollector,
  readCollectorPlayer,
  requireCollector,
  revokeCollector,
} from '../collectors';
import { failure, noStore } from '../respond';
import { jsonBody } from '../validate';

/** What the Windows collector calls: pairing without a session, then its own token. */
export const collectorRoutes = new Hono<AppEnv>()
  .post('/pair', ...jsonBody(pairingCode, { invalid: invalidPairingCode, maxLength: 200 }), async (c) => {
    try {
      const paired: CollectorPairing = await pairCollector(c.env.DB, c.req.valid('json').code);
      return c.json(paired, 200, noStore);
    } catch (error) {
      return failure(c, error, 'Association impossible.');
    }
  })
  .get('/status', requireCollector, async (c) =>
    c.json({ player: await readCollectorPlayer(c.env.DB, c.var.member.id) } satisfies CollectorStatus, 200, noStore),
  );

/** What the member manages from their profile: pairing codes and paired collectors. */
export const collectorDeviceRoutes = new Hono<AppEnv>()
  .get('/', async (c) =>
    c.json({ devices: await listCollectors(c.env.DB, c.var.member.id) } satisfies CollectorDevices, 200, noStore),
  )
  .post('/', sameOriginOnly, async (c) => {
    try {
      const code: PairingCodeCreated = await createPairingCode(c.env.DB, c.var.member.id);
      return c.json(code, 201, noStore);
    } catch (error) {
      return failure(c, error, 'Code impossible à créer.');
    }
  })
  .delete('/', sameOriginOnly, ...jsonBody(collectorToRevoke, { invalid: unknownCollector }), async (c) => {
    try {
      await revokeCollector(c.env.DB, c.var.member.id, c.req.valid('json').id);
      return c.body(null, 204);
    } catch (error) {
      return failure(c, error, 'Révocation impossible.');
    }
  });
