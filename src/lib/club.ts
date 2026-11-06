import type { Database } from './db';

// The club's identity is data, edited in the app by its administrators: its name, and its players,
// who are the members that chose a duo pseudo. A duo pseudo is the player slot every game record uses.

export const platforms = ['pc', 'playstation', 'xbox', 'switch'] as const;
export type Platform = (typeof platforms)[number];

export const isPlatform = (value: unknown): value is Platform => platforms.includes(value as Platform);

export interface ClubPlayer {
  slot: string;
  platform: Platform | null;
}

/** The player slots, in the order the players joined the club. */
export type Roster = readonly string[];

export const rosterOf = (players: readonly ClubPlayer[]): Roster => players.map((player) => player.slot);

export async function readClubName(db: Database): Promise<string> {
  const settings = await db.prepare('SELECT name FROM club_settings WHERE id = 1').first<{ name: string }>();
  return settings?.name ?? 'Big Rocket Camp';
}

export async function readClubPlayers(db: Database): Promise<ClubPlayer[]> {
  const members = await db
    .prepare(
      'SELECT duo_pseudo AS slot, platform FROM members WHERE duo_pseudo IS NOT NULL ORDER BY roster_position, created, id',
    )
    .all<ClubPlayer>();
  return members.results;
}

export async function readRoster(db: Database): Promise<Roster> {
  return rosterOf(await readClubPlayers(db));
}
