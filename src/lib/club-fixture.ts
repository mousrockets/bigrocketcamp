import type { ClubPlayer } from './club';
import type { Database } from './db';

// The tests' club: fictional players, never real ones.
export const players: ClubPlayer[] = [
  { slot: 'alice', platform: 'pc' },
  { slot: 'bob', platform: 'pc' },
  { slot: 'carla', platform: 'playstation' },
];

export const roster: readonly string[] = players.map((player) => player.slot);

/** Makes the fictional players members of the test database's club, as the API reads them. */
export async function joinTestClub(db: Database): Promise<void> {
  // Raw SQL: migration tests also join databases from before the latest migrations, whose members table lacks
  // columns Drizzle's insert would name.
  await db.batch(
    players.map((player, index) =>
      db
        .prepare(
          "INSERT INTO members (id, email, role, duo_pseudo, platform, roster_position) VALUES (?, ?, 'member', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET duo_pseudo = excluded.duo_pseudo, platform = excluded.platform, roster_position = excluded.roster_position",
        )
        .bind(`member-${player.slot}`, `${player.slot}@example.com`, player.slot, player.platform, index + 1),
    ),
  );
}
