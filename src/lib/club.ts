import { asc, isNotNull } from 'drizzle-orm';
import type { Database } from './db';
import { orm } from './orm';
import { members } from './schema';

// The club's identity is data, edited in the app by its administrators: its name, and its players,
// who are the members that chose a duo pseudo. A duo pseudo is the player slot every game record uses.

export const platforms = ['pc', 'playstation', 'xbox', 'switch'] as const;
export type Platform = (typeof platforms)[number];

export interface ClubPlayer {
  slot: string;
  platform: Platform | null;
}

/** The player slots, in the order the players joined the club. */
export type Roster = readonly string[];

export const rosterOf = (players: readonly ClubPlayer[]): Roster => players.map((player) => player.slot);

export async function readClubName(db: Database): Promise<string> {
  const settings = await orm(db).query.clubSettings.findFirst({
    columns: { name: true },
    where: (settings, { eq }) => eq(settings.id, 1),
  });
  return settings?.name ?? 'Big Rocket Camp';
}

export async function readClubPlayers(db: Database): Promise<ClubPlayer[]> {
  return orm(db)
    .select({ slot: members.duoPseudo, platform: members.platform })
    .from(members)
    .where(isNotNull(members.duoPseudo))
    .orderBy(asc(members.rosterPosition), asc(members.created), asc(members.id)) as Promise<ClubPlayer[]>;
}

export async function readRoster(db: Database): Promise<Roster> {
  return rosterOf(await readClubPlayers(db));
}
