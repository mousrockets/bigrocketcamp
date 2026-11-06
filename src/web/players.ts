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
