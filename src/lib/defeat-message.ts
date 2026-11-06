// The message shown when new defeats arrive: each player's real pushups, +5 or +10 with the last place bonus.

export interface Defeat {
  player: string;
  /** What this defeat adds: 5, and 5 more for the team's lowest club player. */
  pushups: number;
}

const forOnePlayer = [
  '+{a} pour {n}… courage, champion.',
  '{n} prend {a} pompes. Le ballon ne pardonne pas.',
  'Défaite pour {n} : +{a}, direction le tapis !',
  '{n} : +{a}. On appelle ça de l’entraînement.',
];

/** "a", "a et b", "a, b et c". */
const names = (players: readonly string[]) =>
  players.length < 2 ? (players[0] ?? '') : `${players.slice(0, -1).join(', ')} et ${players.at(-1)}`;

/** Each player's new pushups, in the order they first appear. */
function totals(defeats: readonly Defeat[]): Defeat[] {
  const byPlayer = new Map<string, number>();
  for (const { player, pushups } of defeats) byPlayer.set(player, (byPlayer.get(player) ?? 0) + pushups);
  return [...byPlayer].map(([player, pushups]) => ({ player, pushups }));
}

/** The taunt for these new defeats; `choose` picks one of the phrasings for a single player. */
export function defeatMessage(
  defeats: readonly Defeat[],
  choose: (count: number) => number = (count) => Math.floor(Math.random() * count),
): string {
  const players = totals(defeats);
  const [only] = players;
  if (!only) return '';
  if (players.length === 1) {
    const template = forOnePlayer[choose(forOnePlayer.length)] ?? forOnePlayer[0] ?? '';
    return template.replace('{n}', only.player).replace('{a}', String(only.pushups));
  }
  if (players.every((defeat) => defeat.pushups === only.pushups)) {
    return `+${only.pushups} pour ${names(players.map((defeat) => defeat.player))}… courage, champions.`;
  }
  return `${players.map((defeat) => `+${defeat.pushups} pour ${defeat.player}`).join(', ')}… courage, champions.`;
}
