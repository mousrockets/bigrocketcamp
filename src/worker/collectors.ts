import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import type { Database } from '../lib/db';
import { orm } from '../lib/orm';
import { collectorDevices, collectorPairingCodes, members } from '../lib/schema';
import { type AppEnv, type Member, randomToken, requireMember, sha256 } from './auth';

// The Windows collector cannot hold the browser's session cookie: a member pairs it once with a short
// code shown on their profile, and it then sends matches with its own token, revocable at any time.

const codeAlphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const codeLength = 8;
const codeLifetime = 10 * 60 * 1000;
const codeAttempts = 5;
const lastSeenPrecision = 60 * 1000;

const withStatus = (message: string, status: number) => Object.assign(new Error(message), { status });

export interface PairingCode {
  code: string;
  expires: string;
}

export interface CollectorDevice {
  id: string;
  created: string;
  lastSeen: string | null;
}

function randomCode(): string {
  // Bytes past the last whole multiple of the alphabet are dropped, so that every character is equally likely.
  const limit = 256 - (256 % codeAlphabet.length);
  let code = '';
  while (code.length < codeLength) {
    for (const byte of crypto.getRandomValues(new Uint8Array(codeLength))) {
      if (byte < limit && code.length < codeLength) code += codeAlphabet[byte % codeAlphabet.length];
    }
  }
  return code;
}

const duoPseudoOf = async (db: Database, memberId: string) => {
  const [member] = await orm(db).select({ duoPseudo: members.duoPseudo }).from(members).where(eq(members.id, memberId));
  return member?.duoPseudo ?? null;
};

/** A new code replaces the member's previous one. */
export async function createPairingCode(db: Database, memberId: string): Promise<PairingCode> {
  if (!(await duoPseudoOf(db, memberId))) throw withStatus('Choisis d’abord ton pseudo duo.', 409);
  const code = randomCode();
  const now = Date.now();
  const query = orm(db);
  const pending = { codeHash: await sha256(code), expires: now + codeLifetime, attempts: 0 };
  await query.batch([
    query.delete(collectorPairingCodes).where(lt(collectorPairingCodes.expires, now)),
    query
      .insert(collectorPairingCodes)
      .values({ memberId, ...pending })
      .onConflictDoUpdate({ target: collectorPairingCodes.memberId, set: pending }),
  ]);
  return { code, expires: new Date(now + codeLifetime).toISOString() };
}

/** Trades a pairing code for the collector's token, once. */
export async function pairCollector(db: Database, code: string): Promise<{ token: string; player: string }> {
  const now = Date.now();
  const query = orm(db);
  const [claimed] = await query
    .delete(collectorPairingCodes)
    .where(
      and(
        eq(collectorPairingCodes.codeHash, await sha256(code)),
        gte(collectorPairingCodes.expires, now),
        lt(collectorPairingCodes.attempts, codeAttempts),
      ),
    )
    .returning({ memberId: collectorPairingCodes.memberId });
  if (!claimed) {
    // A wrong guess cannot be traced to the code it aimed at: it counts against every pending code,
    // so no code takes more than five guesses in its ten minutes.
    await query
      .update(collectorPairingCodes)
      .set({ attempts: sql`${collectorPairingCodes.attempts} + 1` })
      .where(gte(collectorPairingCodes.expires, now));
    throw withStatus('Code inconnu, expiré ou déjà utilisé : génère un nouveau code dans ton profil.', 401);
  }
  const token = randomToken();
  await query
    .insert(collectorDevices)
    .values({ id: crypto.randomUUID(), tokenHash: await sha256(token), memberId: claimed.memberId, created: now });
  return { token, player: (await duoPseudoOf(db, claimed.memberId)) ?? '' };
}

export async function listCollectors(db: Database, memberId: string): Promise<CollectorDevice[]> {
  const rows = await orm(db)
    .select({ id: collectorDevices.id, created: collectorDevices.created, lastSeen: collectorDevices.lastSeen })
    .from(collectorDevices)
    .where(eq(collectorDevices.memberId, memberId))
    .orderBy(asc(collectorDevices.created), asc(collectorDevices.id));
  return rows.map((row) => ({
    id: row.id,
    created: new Date(row.created).toISOString(),
    lastSeen: row.lastSeen === null ? null : new Date(row.lastSeen).toISOString(),
  }));
}

export async function revokeCollector(db: Database, memberId: string, deviceId: string): Promise<void> {
  const removed = await orm(db)
    .delete(collectorDevices)
    .where(and(eq(collectorDevices.id, deviceId), eq(collectorDevices.memberId, memberId)))
    .returning({ id: collectorDevices.id });
  if (!removed.length) throw withStatus('Collecteur introuvable.', 404);
}

/** The player slot of the member a collector is paired with, empty until they choose a duo pseudo. */
export async function readCollectorPlayer(db: Database, memberId: string): Promise<string> {
  return (await duoPseudoOf(db, memberId)) ?? '';
}

/** Rejects the request with 401 unless it carries the token of a paired collector, and records its contact. */
export const requireCollector: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = /^Bearer (\S+)$/.exec(c.req.header('authorization') ?? '')?.[1];
  const rejected = () => c.json({ error: 'Collecteur non associé : associe-le depuis ton profil.' }, 401);
  if (!token) return rejected();
  const db = orm(c.env.DB);
  const [found] = await db
    .select({
      device: collectorDevices.id,
      lastSeen: collectorDevices.lastSeen,
      id: members.id,
      email: members.email,
      role: members.role,
    })
    .from(collectorDevices)
    .innerJoin(members, eq(members.id, collectorDevices.memberId))
    .where(eq(collectorDevices.tokenHash, await sha256(token)));
  if (!found) return rejected();
  const now = Date.now();
  // Once a minute is precise enough for "last contact", and spares a write per request.
  if (found.lastSeen === null || now - found.lastSeen >= lastSeenPrecision) {
    await db.update(collectorDevices).set({ lastSeen: now }).where(eq(collectorDevices.id, found.device));
  }
  c.set('member', { id: found.id, email: found.email, role: found.role } satisfies Member);
  c.set('collector', found.device);
  await next();
};

/** The browser sends its session cookie; the collector, its token. */
export const requireMemberOrCollector: MiddlewareHandler<AppEnv> = (c, next) =>
  c.req.header('authorization') ? requireCollector(c, next) : requireMember(c, next);
