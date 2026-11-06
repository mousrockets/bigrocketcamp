import { isPlatform, type Platform } from './club';
import type { Database } from './db';

// Members join by invitation only, from an administrator, and fill in their own profile.

export const roles = ['admin', 'member'] as const;
export type Role = (typeof roles)[number];

export const isRole = (value: unknown): value is Role => roles.includes(value as Role);

export interface Profile {
  id: string;
  email: string;
  role: Role;
  duoPseudo: string | null;
  soloPseudo: string | null;
  platform: Platform | null;
}

export interface OwnProfile extends Profile {
  /** A duo pseudo with game history no longer changes: every record of the player is keyed by it. */
  duoPseudoLocked: boolean;
}

/** An error the API answers with its own HTTP status. */
const withStatus = (message: string, status: number) => Object.assign(new Error(message), { status });

// "observer" is the slot of the retired Epic integration's spectator account.
const reservedSlots = ['observer'];

export function normalizeDuoPseudo(input: unknown): string {
  const pseudo = typeof input === 'string' ? input.trim().toLowerCase() : '';
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._-]{1,31}$/u.test(pseudo) || reservedSlots.includes(pseudo)) {
    throw withStatus('Pseudo duo : de 2 à 32 lettres, chiffres, espaces, points ou tirets.', 400);
  }
  return pseudo;
}

export function normalizeSoloPseudo(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const pseudo = typeof input === 'string' ? input.trim() : null;
  if (pseudo === '') return null;
  if (pseudo === null || !/^[^\p{C}]{1,32}$/u.test(pseudo))
    throw withStatus('Pseudo solo : 32 caractères au plus.', 400);
  return pseudo;
}

export function normalizeClubName(input: unknown): string {
  const name = typeof input === 'string' ? input.trim().replace(/\s+/g, ' ') : '';
  if (!/^[^\p{C}]{2,60}$/u.test(name)) throw withStatus('Nom du club : de 2 à 60 caractères.', 400);
  return name;
}

interface MemberRow {
  id: string;
  email: string;
  role: Role;
  duo_pseudo: string | null;
  solo_pseudo: string | null;
  platform: Platform | null;
}

const asProfile = (row: MemberRow): Profile => ({
  id: row.id,
  email: row.email,
  role: row.role,
  duoPseudo: row.duo_pseudo,
  soloPseudo: row.solo_pseudo,
  platform: row.platform,
});

const memberColumns = 'id, email, role, duo_pseudo, solo_pseudo, platform';

/** Whether a player slot already names some game record: renaming it would orphan them. */
export async function slotHasHistory(db: Database, slot: string): Promise<boolean> {
  const found = await db
    .prepare(
      `SELECT EXISTS (SELECT 1 FROM results WHERE name = ?1)
        OR EXISTS (SELECT 1 FROM exercises WHERE player = ?1)
        OR EXISTS (SELECT 1 FROM mmr_entries WHERE player = ?1)
        OR EXISTS (SELECT 1 FROM player_ranks WHERE player = ?1)
        OR EXISTS (SELECT 1 FROM player_identities WHERE slot = ?1)
        OR EXISTS (SELECT 1 FROM player_identity_aliases WHERE slot = ?1)
        OR EXISTS (SELECT 1 FROM drink_debts WHERE payer = ?1 OR recipient = ?1)
        OR EXISTS (SELECT 1 FROM result_observations WHERE json_extract(payload, '$.name') = ?1) AS found`,
    )
    .bind(slot)
    .first<{ found: number }>();
  return Boolean(found?.found);
}

export async function readOwnProfile(db: Database, memberId: string): Promise<OwnProfile> {
  const row = await db.prepare(`SELECT ${memberColumns} FROM members WHERE id = ?`).bind(memberId).first<MemberRow>();
  if (!row) throw withStatus('Membre introuvable.', 404);
  return { ...asProfile(row), duoPseudoLocked: row.duo_pseudo !== null && (await slotHasHistory(db, row.duo_pseudo)) };
}

export async function saveOwnProfile(db: Database, memberId: string, input: unknown): Promise<OwnProfile> {
  const fields = (input ?? {}) as Record<string, unknown>;
  const duoPseudo = normalizeDuoPseudo(fields.duoPseudo);
  const soloPseudo = normalizeSoloPseudo(fields.soloPseudo);
  if (!isPlatform(fields.platform)) throw withStatus('Choisis ta plateforme.', 400);
  const current = await readOwnProfile(db, memberId);
  if (current.duoPseudoLocked && current.duoPseudo !== duoPseudo) {
    throw withStatus('Ton pseudo duo a déjà un historique : il ne peut plus changer.', 409);
  }
  const holder = await db
    .prepare('SELECT 1 FROM members WHERE duo_pseudo = ? AND id <> ?')
    .bind(duoPseudo, memberId)
    .first();
  if (holder) throw withStatus('Ce pseudo duo est déjà celui d’un autre membre.', 409);
  // A pseudo with history may be chosen: a new player finds their matches under it. Its game identity
  // (player_identities.owner) never follows on its own: only an administrator hands it over.
  try {
    await db
      .prepare(
        `UPDATE members SET duo_pseudo = ?, solo_pseudo = ?, platform = ?,
          roster_position = COALESCE(roster_position, (SELECT COALESCE(MAX(roster_position), 0) + 1 FROM members))
        WHERE id = ?`,
      )
      .bind(duoPseudo, soloPseudo, fields.platform, memberId)
      .run();
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw withStatus('Ce pseudo duo est déjà celui d’un autre membre.', 409);
    throw error;
  }
  return readOwnProfile(db, memberId);
}

export async function listMembers(db: Database): Promise<Profile[]> {
  const rows = await db
    .prepare(`SELECT ${memberColumns} FROM members ORDER BY roster_position IS NULL, roster_position, created, id`)
    .all<MemberRow>();
  return rows.results.map(asProfile);
}

export async function inviteMember(db: Database, email: string, role: unknown): Promise<Profile> {
  if (!isRole(role)) throw withStatus('Rôle invalide.', 400);
  const added = await db
    .prepare('INSERT INTO members (id, email, role) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING')
    .bind(crypto.randomUUID(), email, role)
    .run();
  if (!Number(added.meta?.changes ?? added.changes)) throw withStatus('Cette adresse est déjà membre du club.', 409);
  const row = await db.prepare(`SELECT ${memberColumns} FROM members WHERE email = ?`).bind(email).first<MemberRow>();
  if (!row) throw withStatus('Invitation impossible.', 500);
  return asProfile(row);
}

/** Closes the member's sessions and pending code; their game records stay with their pseudo. */
function forgetMember(db: Database, memberId: string) {
  return [
    db.prepare('DELETE FROM sessions WHERE member_id = ?').bind(memberId),
    db.prepare('DELETE FROM sign_in_codes WHERE email = (SELECT email FROM members WHERE id = ?)').bind(memberId),
    db.prepare('DELETE FROM members WHERE id = ?').bind(memberId),
  ];
}

export async function removeMember(db: Database, adminId: string, memberId: unknown): Promise<void> {
  if (typeof memberId !== 'string') throw withStatus('Membre inconnu.', 400);
  if (memberId === adminId) throw withStatus('Pour quitter le club, supprime ton compte depuis ton profil.', 400);
  if (!(await db.prepare('SELECT 1 FROM members WHERE id = ?').bind(memberId).first())) {
    throw withStatus('Membre introuvable.', 404);
  }
  await db.batch(forgetMember(db, memberId));
}

const otherAdmins = (db: Database, memberId: string) =>
  db
    .prepare("SELECT COUNT(*) AS n FROM members WHERE role = 'admin' AND id <> ?")
    .bind(memberId)
    .first<{ n: number }>()
    .then((row) => row?.n ?? 0);

export async function setMemberRole(db: Database, memberId: unknown, role: unknown): Promise<void> {
  if (typeof memberId !== 'string') throw withStatus('Membre inconnu.', 400);
  if (!isRole(role)) throw withStatus('Rôle invalide.', 400);
  if (role === 'member' && (await otherAdmins(db, memberId)) === 0) {
    throw withStatus('Le club garde au moins un administrateur.', 409);
  }
  const updated = await db.prepare('UPDATE members SET role = ? WHERE id = ?').bind(role, memberId).run();
  if (!Number(updated.meta?.changes ?? updated.changes)) throw withStatus('Membre introuvable.', 404);
}

/** A member leaves the club on their own: their account goes, their game records stay with their pseudo. */
export async function deleteOwnAccount(db: Database, memberId: string): Promise<void> {
  const profile = await readOwnProfile(db, memberId);
  const others = await db
    .prepare('SELECT COUNT(*) AS n FROM members WHERE id <> ?')
    .bind(memberId)
    .first<{ n: number }>();
  if (profile.role === 'admin' && (others?.n ?? 0) > 0 && (await otherAdmins(db, memberId)) === 0) {
    throw withStatus('Nomme un autre administrateur avant de supprimer ton compte.', 409);
  }
  await db.batch(forgetMember(db, memberId));
}

export async function saveClubName(db: Database, input: unknown): Promise<string> {
  const name = normalizeClubName(input);
  await db
    .prepare('INSERT INTO club_settings (id, name) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name')
    .bind(name)
    .run();
  return name;
}
