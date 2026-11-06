import { Hono } from 'hono';
import { readRoster } from '../../lib/club';
import {
  canonicalPlayerId,
  readIdentityBindings,
  readPlayerIdentities,
  unassignedPrefix,
} from '../../lib/player-identities';
import { readMerged } from '../../lib/reconcile';
import { type AppEnv, sameOrigin } from '../auth';

export const identityRoutes = new Hono<AppEnv>();

const noStore = { 'Cache-Control': 'no-store' };
const gamePlayerId = /^(Epic|Steam|PS4|XboxOne|Switch|PsyNet)\|[^\s|]{1,128}\|0$/;

identityRoutes.get('/', async (c) => {
  const db = c.env.DB;
  const roster = await readRoster(db);
  const [identities, aliases, merged] = await Promise.all([
    readPlayerIdentities(db, roster),
    readIdentityBindings(db, roster),
    readMerged(db, roster),
  ]);
  const isBound = (playerId: string) =>
    aliases.some((alias) => canonicalPlayerId(alias.player_id) === canonicalPlayerId(playerId));
  const seen = new Set<string>();
  const candidates = merged.rows
    .filter((row) => row.kind === 'match' && !row.review_required && !isBound(row.player_id))
    .filter((row) => {
      const id = canonicalPlayerId(row.player_id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, 50)
    .map((row) => ({
      playerId: canonicalPlayerId(row.player_id),
      name: row.name.startsWith(unassignedPrefix) ? row.name.slice(unassignedPrefix.length) : row.name,
      day: row.day,
    }));
  const memberId = c.var.member.id;
  return c.json(
    {
      retired: true,
      identities: roster.map((slot) => {
        const identity = identities.find((candidate) => candidate.slot === slot);
        return {
          slot,
          known: Boolean(identity),
          owned: identity?.owner === memberId,
          aliases: aliases
            .filter((alias) => alias.slot === slot)
            .map((alias) => ({ playerId: alias.player_id, primary: alias.player_id === identity?.player_id })),
        };
      }),
      candidates,
    },
    200,
    noStore,
  );
});

identityRoutes.post('/', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'Origine refusée.' }, 403, noStore);
  const body = await c.req.text();
  if (body.length > 2000) return c.json({ error: 'Envoi trop volumineux.' }, 413, noStore);
  const db = c.env.DB;
  const memberId = c.var.member.id;
  try {
    const { slot, playerId: rawId, action = 'confirm' } = JSON.parse(body);
    const roster = await readRoster(db);
    if (!roster.includes(slot) || typeof rawId !== 'string' || rawId.length > 256)
      throw new Error('Identifiant invalide.');
    const playerId = canonicalPlayerId(rawId);
    const identity = (await readPlayerIdentities(db, roster, memberId)).find((candidate) => candidate.slot === slot);
    if (!identity) {
      return c.json({ error: 'Seul le membre associé à ce joueur peut confirmer son identifiant.' }, 403, noStore);
    }
    if (action === 'remove') {
      if (playerId === identity.player_id) throw new Error('L’identifiant principal est conservé.');
      await db
        .prepare('DELETE FROM player_identity_aliases WHERE player_id = ? AND slot = ? AND confirmed_by = ?')
        .bind(playerId, slot, memberId)
        .run();
      return c.json({ ok: true }, 200, noStore);
    }
    if (action !== 'confirm' || !gamePlayerId.test(playerId)) throw new Error('Identifiant invalide.');
    const merged = await readMerged(db, roster);
    const seenInAMatch = merged.rows.some(
      (row) => row.kind === 'match' && !row.review_required && canonicalPlayerId(row.player_id) === playerId,
    );
    if (!seenInAMatch) throw new Error('Choisis un joueur déjà présent dans un tableau reçu.');
    await db
      .prepare(
        'INSERT INTO player_identity_aliases (player_id, slot, confirmed_by, confirmed_at) SELECT ?, slot, owner, ? FROM player_identities WHERE slot = ? AND owner = ? ON CONFLICT(player_id) DO NOTHING',
      )
      .bind(playerId, new Date().toISOString(), slot, memberId)
      .run();
    const saved = await db
      .prepare('SELECT slot FROM player_identity_aliases WHERE player_id = ?')
      .bind(playerId)
      .first<{ slot: string }>();
    if (saved?.slot !== slot)
      return c.json({ error: 'Cet identifiant est déjà attribué à un autre joueur.' }, 409, noStore);
    return c.json({ ok: true }, 200, noStore);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Confirmation impossible.' }, 400, noStore);
  }
});
