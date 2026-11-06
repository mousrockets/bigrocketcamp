// Build-time club identity, read by the web app only until it reads the club from the API.
// The API reads the club from the database (src/lib/club.ts).
const configuredRoster = import.meta.env.VITE_CLUB_ROSTER ?? 'alice,bob,carla';

export const clubName: string = import.meta.env.VITE_CLUB_NAME ?? 'Big Rocket Camp';

export const roster: readonly string[] = configuredRoster
  .split(',')
  .map((name: string) => name.trim().toLowerCase())
  .filter(Boolean);
