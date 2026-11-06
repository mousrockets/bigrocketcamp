// The club's identity is configuration, never code: set VITE_CLUB_NAME and VITE_CLUB_ROSTER
// (comma-separated player names, lowercase) at build time. Both the API and the web app read them.
const configuredRoster = import.meta.env.VITE_CLUB_ROSTER ?? 'alice,bob,carla';

export const clubName: string = import.meta.env.VITE_CLUB_NAME ?? 'Big Rocket Camp';

export const roster: readonly string[] = configuredRoster
  .split(',')
  .map((name: string) => name.trim().toLowerCase())
  .filter(Boolean);
