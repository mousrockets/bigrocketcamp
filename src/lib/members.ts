import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { Platform } from './club';
import type { Database } from './db';
import { orm } from './orm';
import { clubSettings, collectorDevices, collectorPairingCodes, members, sessions, signInCodes } from './schema';

// Members join by invitation only, from an administrator, and fill in their own profile.

export const roles = ['admin', 'member'] as const;
export type Role = (typeof roles)[number];

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

const profileColumns = {
  id: members.id,
  email: members.email,
  role: members.role,
  duoPseudo: members.duoPseudo,
  soloPseudo: members.soloPseudo,
  platform: members.platform,
};

/** A unique index refused the write; Drizzle keeps the database's own error as the cause. */
const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Error && (error.message.includes('UNIQUE') || isUniqueViolation(error.cause));

/** Whether a player slot already names some game record: renaming it would orphan them. */
export async function slotHasHistory(db: Database, slot: string): Promise<boolean> {
  const found = await db
    .prepare(
      `SELECT EXISTS (SELECT 1 FROM prototype_results WHERE name = ?1)
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
  const [row] = await orm(db).select(profileColumns).from(members).where(eq(members.id, memberId));
  if (!row) throw withStatus('Membre introuvable.', 404);
  return { ...row, duoPseudoLocked: row.duoPseudo !== null && (await slotHasHistory(db, row.duoPseudo)) };
}

export interface ProfileInput {
  duoPseudo: string;
  soloPseudo: string | null;
  platform: Platform;
}

export async function saveOwnProfile(
  db: Database,
  memberId: string,
  { duoPseudo, soloPseudo, platform }: ProfileInput,
): Promise<OwnProfile> {
  const current = await readOwnProfile(db, memberId);
  if (current.duoPseudoLocked && current.duoPseudo !== duoPseudo) {
    throw withStatus('Ton pseudo duo a déjà un historique : il ne peut plus changer.', 409);
  }
  const [holder] = await orm(db)
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.duoPseudo, duoPseudo), ne(members.id, memberId)));
  if (holder) throw withStatus('Ce pseudo duo est déjà celui d’un autre membre.', 409);
  // A pseudo with history may be chosen: a new player finds their matches under it. Its game identity
  // (player_identities.owner) never follows on its own: only an administrator hands it over.
  try {
    await orm(db)
      .update(members)
      .set({
        duoPseudo,
        soloPseudo,
        platform,
        rosterPosition: sql`COALESCE(${members.rosterPosition}, (SELECT COALESCE(MAX(${members.rosterPosition}), 0) + 1 FROM ${members}))`,
      })
      .where(eq(members.id, memberId));
  } catch (error) {
    if (isUniqueViolation(error)) throw withStatus('Ce pseudo duo est déjà celui d’un autre membre.', 409);
    throw error;
  }
  return readOwnProfile(db, memberId);
}

export async function listMembers(db: Database): Promise<Profile[]> {
  return orm(db)
    .select(profileColumns)
    .from(members)
    .orderBy(
      sql`${members.rosterPosition} IS NULL`,
      asc(members.rosterPosition),
      asc(members.created),
      asc(members.id),
    );
}

export async function inviteMember(db: Database, email: string, role: Role): Promise<Profile> {
  const [added] = await orm(db)
    .insert(members)
    .values({ id: crypto.randomUUID(), email, role })
    .onConflictDoNothing({ target: members.email })
    .returning(profileColumns);
  if (!added) throw withStatus('Cette adresse est déjà membre du club.', 409);
  return added;
}

/** Closes the member's sessions, collectors and pending codes; their game records stay with their pseudo. */
async function forgetMember(db: Database, memberId: string) {
  const query = orm(db);
  await query.batch([
    query.delete(sessions).where(eq(sessions.memberId, memberId)),
    query.delete(collectorDevices).where(eq(collectorDevices.memberId, memberId)),
    query.delete(collectorPairingCodes).where(eq(collectorPairingCodes.memberId, memberId)),
    query
      .delete(signInCodes)
      .where(
        eq(signInCodes.email, query.select({ email: members.email }).from(members).where(eq(members.id, memberId))),
      ),
    query.delete(members).where(eq(members.id, memberId)),
  ]);
}

export async function removeMember(db: Database, adminId: string, memberId: string): Promise<void> {
  if (memberId === adminId) throw withStatus('Pour quitter le club, supprime ton compte depuis ton profil.', 400);
  if (!(await orm(db).$count(members, eq(members.id, memberId)))) throw withStatus('Membre introuvable.', 404);
  await forgetMember(db, memberId);
}

const otherAdmins = (db: Database, memberId: string) =>
  orm(db).$count(members, and(eq(members.role, 'admin'), ne(members.id, memberId)));

export async function setMemberRole(db: Database, memberId: string, role: Role): Promise<void> {
  if (role === 'member' && (await otherAdmins(db, memberId)) === 0) {
    throw withStatus('Le club garde au moins un administrateur.', 409);
  }
  const updated = await orm(db)
    .update(members)
    .set({ role })
    .where(eq(members.id, memberId))
    .returning({ id: members.id });
  if (!updated.length) throw withStatus('Membre introuvable.', 404);
}

/** A member leaves the club on their own: their account goes, their game records stay with their pseudo. */
export async function deleteOwnAccount(db: Database, memberId: string): Promise<void> {
  const profile = await readOwnProfile(db, memberId);
  const others = await orm(db).$count(members, ne(members.id, memberId));
  if (profile.role === 'admin' && others > 0 && (await otherAdmins(db, memberId)) === 0) {
    throw withStatus('Nomme un autre administrateur avant de supprimer ton compte.', 409);
  }
  await forgetMember(db, memberId);
}

export async function saveClubName(db: Database, name: string): Promise<string> {
  await orm(db)
    .insert(clubSettings)
    .values({ id: 1, name })
    .onConflictDoUpdate({ target: clubSettings.id, set: { name } });
  return name;
}
