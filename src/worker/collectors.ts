import type { MiddlewareHandler } from 'hono';
import type { Database } from '../lib/db';
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

/** The code as typed: case, spaces and dashes do not matter. */
export function normalizePairingCode(input: unknown): string | null {
  const code = typeof input === 'string' ? input.toUpperCase().replace(/[\s-]/g, '') : '';
  return code.length === codeLength && [...code].every((char) => codeAlphabet.includes(char)) ? code : null;
}

/** A new code replaces the member's previous one. */
export async function createPairingCode(db: Database, memberId: string): Promise<PairingCode> {
  const member = await db
    .prepare('SELECT duo_pseudo FROM members WHERE id = ?')
    .bind(memberId)
    .first<{ duo_pseudo: string | null }>();
  if (!member?.duo_pseudo) throw withStatus('Choisis d’abord ton pseudo duo.', 409);
  const code = randomCode();
  const now = Date.now();
  await db.batch([
    db.prepare('DELETE FROM collector_pairing_codes WHERE expires < ?').bind(now),
    db
      .prepare(
        'INSERT INTO collector_pairing_codes (code_hash, member_id, expires, attempts) VALUES (?, ?, ?, 0) ON CONFLICT(member_id) DO UPDATE SET code_hash = excluded.code_hash, expires = excluded.expires, attempts = 0',
      )
      .bind(await sha256(code), memberId, now + codeLifetime),
  ]);
  return { code, expires: new Date(now + codeLifetime).toISOString() };
}

/** Trades a pairing code for the collector's token, once. */
export async function pairCollector(db: Database, input: unknown): Promise<{ token: string; player: string }> {
  const code = normalizePairingCode(input);
  if (!code) throw withStatus('Le code d’association fait 8 caractères.', 400);
  const now = Date.now();
  const claimed = await db
    .prepare(
      'DELETE FROM collector_pairing_codes WHERE code_hash = ? AND expires >= ? AND attempts < ? RETURNING member_id',
    )
    .bind(await sha256(code), now, codeAttempts)
    .first<{ member_id: string }>();
  if (!claimed) {
    // A wrong guess cannot be traced to the code it aimed at: it counts against every pending code,
    // so no code takes more than five guesses in its ten minutes.
    await db.prepare('UPDATE collector_pairing_codes SET attempts = attempts + 1 WHERE expires >= ?').bind(now).run();
    throw withStatus('Code inconnu, expiré ou déjà utilisé : génère un nouveau code dans ton profil.', 401);
  }
  const token = randomToken();
  await db
    .prepare('INSERT INTO collector_devices (id, token_hash, member_id, created) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), await sha256(token), claimed.member_id, now)
    .run();
  const member = await db
    .prepare('SELECT duo_pseudo FROM members WHERE id = ?')
    .bind(claimed.member_id)
    .first<{ duo_pseudo: string | null }>();
  return { token, player: member?.duo_pseudo ?? '' };
}

export async function listCollectors(db: Database, memberId: string): Promise<CollectorDevice[]> {
  const rows = await db
    .prepare('SELECT id, created, last_seen FROM collector_devices WHERE member_id = ? ORDER BY created, id')
    .bind(memberId)
    .all<{ id: string; created: number; last_seen: number | null }>();
  return rows.results.map((row) => ({
    id: row.id,
    created: new Date(row.created).toISOString(),
    lastSeen: row.last_seen === null ? null : new Date(row.last_seen).toISOString(),
  }));
}

export async function revokeCollector(db: Database, memberId: string, deviceId: unknown): Promise<void> {
  if (typeof deviceId !== 'string') throw withStatus('Collecteur inconnu.', 400);
  const removed = await db
    .prepare('DELETE FROM collector_devices WHERE id = ? AND member_id = ?')
    .bind(deviceId, memberId)
    .run();
  if (!Number(removed.meta?.changes ?? removed.changes)) throw withStatus('Collecteur introuvable.', 404);
}

interface CollectorRow extends Member {
  device: string;
  last_seen: number | null;
}

/** Rejects the request with 401 unless it carries the token of a paired collector, and records its contact. */
export const requireCollector: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = /^Bearer (\S+)$/.exec(c.req.header('authorization') ?? '')?.[1];
  const rejected = () => c.json({ error: 'Collecteur non associé : associe-le depuis ton profil.' }, 401);
  if (!token) return rejected();
  const db = c.env.DB;
  const found = await db
    .prepare(
      'SELECT collector_devices.id AS device, collector_devices.last_seen, members.id, members.email, members.role FROM collector_devices JOIN members ON members.id = collector_devices.member_id WHERE collector_devices.token_hash = ?',
    )
    .bind(await sha256(token))
    .first<CollectorRow>();
  if (!found) return rejected();
  const now = Date.now();
  // Once a minute is precise enough for "last contact", and spares a write per request.
  if (found.last_seen === null || now - found.last_seen >= lastSeenPrecision) {
    await db.prepare('UPDATE collector_devices SET last_seen = ? WHERE id = ?').bind(now, found.device).run();
  }
  c.set('member', { id: found.id, email: found.email, role: found.role });
  c.set('collector', found.device);
  await next();
};

/** The browser sends its session cookie; the collector, its token. */
export const requireMemberOrCollector: MiddlewareHandler<AppEnv> = (c, next) =>
  c.req.header('authorization') ? requireCollector(c, next) : requireMember(c, next);
