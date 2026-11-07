import { and, asc, eq, exists, isNotNull, ne, or, sql } from 'drizzle-orm';
import type { Platform } from './club';
import type { Database } from './db';
import { orm } from './orm';
import {
  clubSettings,
  collectorDevices,
  collectorPairingCodes,
  drinkDebts,
  exercises,
  members,
  mmrEntries,
  playerIdentities,
  playerIdentityAliases,
  playerRanks,
  prototypeResults,
  resultObservations,
  sessions,
  signInCodes,
  soloMmrEntries,
  soloRanks,
} from './schema';

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
  const query = orm(db);
  const any = { one: sql`1` };
  const hasRecord = or(
    exists(query.select(any).from(prototypeResults).where(eq(prototypeResults.name, slot))),
    exists(query.select(any).from(exercises).where(eq(exercises.player, slot))),
    exists(query.select(any).from(mmrEntries).where(eq(mmrEntries.player, slot))),
    exists(query.select(any).from(playerRanks).where(eq(playerRanks.player, slot))),
    exists(
      query
        .select(any)
        .from(soloRanks)
        .where(and(eq(soloRanks.player, slot), isNotNull(soloRanks.mmr))),
    ),
    exists(query.select(any).from(soloMmrEntries).where(eq(soloMmrEntries.player, slot))),
    exists(query.select(any).from(playerIdentities).where(eq(playerIdentities.slot, slot))),
    exists(query.select(any).from(playerIdentityAliases).where(eq(playerIdentityAliases.slot, slot))),
    exists(
      query
        .select(any)
        .from(drinkDebts)
        .where(or(eq(drinkDebts.payer, slot), eq(drinkDebts.recipient, slot))),
    ),
    exists(
      query
        .select(any)
        .from(resultObservations)
        .where(sql`json_extract(${resultObservations.payload}, '$.name') = ${slot}`),
    ),
  );
  // Raw outer SELECT: Drizzle has no select without a table. (D1 refuses a UNION ALL of ten terms.)
  const found = await query.get<{ found: number }>(sql`SELECT ${hasRecord} AS found`);
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
  // Another solo pseudo or platform may name another account: the rank source looks it up again.
  const soloAccountChanged =
    current.soloPseudo?.toLowerCase() !== soloPseudo?.toLowerCase() ||
    current.platform !== platform ||
    current.duoPseudo !== duoPseudo;
  // A pseudo with history may be chosen: a new player finds their matches under it. Its game identity
  // (player_identities.owner) never follows on its own: only an administrator hands it over.
  try {
    const query = orm(db);
    const update = query
      .update(members)
      .set({
        duoPseudo,
        soloPseudo,
        platform,
        ...(soloAccountChanged ? { soloPlayerId: null, soloChangedAt: new Date().toISOString() } : {}),
        rosterPosition: sql`COALESCE(${members.rosterPosition}, (SELECT COALESCE(MAX(${members.rosterPosition}), 0) + 1 FROM ${members}))`,
      })
      .where(eq(members.id, memberId));
    if (soloAccountChanged && current.duoPseudo !== null) {
      await query.batch([update, query.delete(soloRanks).where(eq(soloRanks.player, current.duoPseudo))]);
    } else {
      await update;
    }
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
