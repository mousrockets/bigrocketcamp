// Retired integration. These compatibility entry points never contact Epic or PsyNet.
import { roster } from './club';
import type { Database } from './db';
import { dailyRecap } from './domain';
import { readDoublesRanks } from './doubles-ranks';
import { readPlayerIdentities } from './player-identities';
import { readMerged } from './reconcile';

interface WithDatabase {
  DB: Database;
  EPIC_VAULT_KEY?: unknown;
}

export const slots = ['observer', ...roster];
export const retiredReason = 'Connexion communautaire Epic retirée. Utilise le Direct PC officiel.';
// Retirement is unconditional; changing an environment flag cannot restore logins.
export const collectionPaused = () => true;

export async function beginLink(): Promise<never> {
  throw new Error(retiredReason);
}

export async function finishLink(): Promise<never> {
  throw new Error(retiredReason);
}

export async function syncHistories(..._unused: unknown[]) {
  return { synced: 0, ranksUpdated: 0, paused: true, retired: true, reason: retiredReason, results: [] };
}

export async function autoSync(..._unused: unknown[]) {
  return { ran: false, paused: true, retired: true };
}

export async function connectionStatus(env: WithDatabase, userId: string) {
  const identities = await readPlayerIdentities(env.DB);
  const credentialsStored = await env.DB.prepare(
    'SELECT (SELECT COUNT(*) FROM epic_accounts) AS accounts,(SELECT COUNT(*) FROM epic_grants) AS pending',
  ).first();
  return {
    connections: slots.map((slot) => {
      const identity = identities.find((candidate) => candidate.slot === slot);
      return {
        slot,
        connected: false,
        owned: identity?.owner === userId,
        identityKnown: Boolean(identity),
        status: 'retired',
        lastSync: identity?.last_sync ?? null,
        lastAttempt: identity?.last_attempt ?? null,
        coverage: identity?.coverage ?? 'recent_only',
        detail: retiredReason,
      };
    }),
    pending: [],
    doublesRanks: await readDoublesRanks(env.DB),
    configured: false,
    paused: true,
    retired: true,
    vaultConfigured: Boolean(env.EPIC_VAULT_KEY),
    credentialsStored,
  };
}

// An old tab may still ask to disconnect. Forget only its owner's old credentials;
// keep the non-secret identity required by the official local score collector.
export async function disconnect(env: WithDatabase, userId: string, slot: unknown) {
  if (typeof slot !== 'string' || !slots.includes(slot)) throw new Error('Compte inconnu.');
  const identity = (await readPlayerIdentities(env.DB)).find((candidate) => candidate.slot === slot);
  if (identity && identity.owner !== userId) throw new Error('Seul le membre associé à cette identité peut la gérer.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM epic_accounts WHERE slot=? AND owner=?').bind(slot, userId),
    env.DB.prepare('DELETE FROM epic_grants WHERE slot=? AND owner=?').bind(slot, userId),
  ]);
  return { ok: true, retired: true };
}

export async function recapState(env: WithDatabase, day: string) {
  const merged = await readMerged(env.DB);
  return {
    ...dailyRecap(merged.rows, day, merged.rosters),
    reliability: merged.reliability,
    coverage: (await readPlayerIdentities(env.DB)).map((identity) => ({
      slot: identity.slot,
      status: 'retired',
      last_sync: identity.last_sync,
      coverage: identity.coverage,
      detail: retiredReason,
    })),
  };
}
