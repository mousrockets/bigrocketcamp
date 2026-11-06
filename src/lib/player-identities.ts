import type { Roster } from './club';
import type { Database } from './db';
import { playerKey } from './reconcile';

export const unassignedPrefix = 'Non attribué · ';

export const canonicalPlayerId = (id: unknown): string =>
  playerKey(id).replace(/^(Epic\|)([^|]+)/, (_, prefix: string, uid: string) => prefix + uid.toLowerCase());

export interface PlayerIdentity {
  slot: string;
  owner: string;
  player_id: string;
  last_sync: string | null;
  last_attempt: string | null;
  coverage: string;
}

export interface IdentityBinding {
  slot: string;
  player_id: string;
}

export async function readPlayerIdentities(db: Database, roster: Roster, owner?: string): Promise<PlayerIdentity[]> {
  const columns = 'SELECT slot,owner,player_id,last_sync,last_attempt,coverage FROM player_identities';
  const query = owner === undefined ? db.prepare(columns) : db.prepare(`${columns} WHERE owner=?`).bind(owner);
  return (await query.all<PlayerIdentity>()).results.filter((identity) => roster.includes(identity.slot));
}

export async function readIdentityBindings(db: Database, roster: Roster): Promise<IdentityBinding[]> {
  const bindings = await db.prepare('SELECT player_id,slot FROM player_identity_aliases').all<IdentityBinding>();
  return bindings.results.filter((binding) => roster.includes(binding.slot));
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
