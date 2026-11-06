// Players are club settings, not code: initials come from the name, platforms from VITE_CLUB_PLATFORMS
// ("name:platform" pairs separated by commas, for example "carla:PS5"). A player without an entry plays on PC.
const configuredPlatforms: string = import.meta.env.VITE_CLUB_PLATFORMS ?? '';

const platforms = new Map(
  configuredPlatforms
    .split(',')
    .map((entry) => entry.split(':').map((part) => part.trim()))
    .filter((parts): parts is [string, string] => parts.length === 2 && !!parts[0] && !!parts[1])
    .map(([name, platform]) => [name.toLowerCase(), platform] as const),
);

export function playerPlatform(name: string): string {
  return platforms.get(name) ?? 'PC';
}

// "chat-pris-tea" gives CT and "kevin-74000" K7: first and last parts of a compound name.
// "nokouki" gives NK: the first letter, then the next consonant, which reads better than "NO".
export function playerInitials(name: string): string {
  const parts = name.split(/[-_.\s]+/).filter(Boolean);
  const first = parts[0] ?? name;
  const last = parts.at(-1);
  if (parts.length > 1 && last) return (first.charAt(0) + last.charAt(0)).toUpperCase();
  const consonant = first.slice(1).match(/[b-df-hj-np-tv-z]/i)?.[0];
  return (consonant ? first.charAt(0) + consonant : first.slice(0, 2)).toUpperCase();
}
