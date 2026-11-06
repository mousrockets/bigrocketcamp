import { eq } from 'drizzle-orm';
import type { Roster } from './club';
import type { Database } from './db';
import { orm } from './orm';
import { playerKey } from './reconcile';
import { playerIdentities, playerIdentityAliases } from './schema';

export const unassignedPrefix = 'Non attribué · ';

export const canonicalPlayerId = (id: unknown): string =>
  playerKey(id).replace(/^(Epic\|)([^|]+)/, (_, prefix: string, uid: string) => prefix + uid.toLowerCase());

export interface PlayerIdentity {
  slot: string;
  owner: string;
  player_id: string;
}

export interface IdentityBinding {
  slot: string;
  player_id: string;
}

/** The club players' main game IDs, or only those the member owns. */
export async function readPlayerIdentities(db: Database, roster: Roster, owner?: string): Promise<PlayerIdentity[]> {
  const identities = await orm(db)
    .select({ slot: playerIdentities.slot, owner: playerIdentities.owner, player_id: playerIdentities.playerId })
    .from(playerIdentities)
    .where(owner === undefined ? undefined : eq(playerIdentities.owner, owner));
  return identities.filter((identity) => roster.includes(identity.slot));
}

/** Every game ID confirmed for a club player. */
export async function readIdentityBindings(db: Database, roster: Roster): Promise<IdentityBinding[]> {
  const bindings = await orm(db)
    .select({ player_id: playerIdentityAliases.playerId, slot: playerIdentityAliases.slot })
    .from(playerIdentityAliases);
  return bindings.filter((binding) => roster.includes(binding.slot));
}

/** Names a received player after the club member who confirmed that game ID; a namesake stays unassigned. */
export function attributeLivePlayers<Row extends { playerId: string; name: string }>(
  roster: Roster,
  rows: Row[],
  bindings: IdentityBinding[],
): Row[] {
  return rows.map((row) => {
    const identity = bindings.find(
      (binding) => canonicalPlayerId(binding.player_id) === canonicalPlayerId(row.playerId),
    );
    return { ...row, name: identity?.slot || (roster.includes(row.name) ? unassignedPrefix + row.name : row.name) };
  });
}
