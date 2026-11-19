// The sound badges: clearing one's debt draws one of these sounds at random, and the first draw of each unlocks
// its badge. Eight families of five, each in the colours of a rank family, from Bronze to Supersonic Legend. Each
// badge is named after the game's world (a quick chat, a mechanic, a meme); its sound is a free one that fits (`id`).

export const soundFamilies = [
  { name: 'Le garage', tier: 1 },
  { name: 'Les mécaniques', tier: 4 },
  { name: 'Le stade', tier: 7 },
  { name: 'Les quick chats', tier: 10 },
  { name: 'La ranked', tier: 13 },
  { name: 'Les modes extra', tier: 16 },
  { name: 'Le shop', tier: 19 },
  { name: 'Les légendes', tier: 22 },
] as const;

export const sounds = [
  { id: 'engine-rev', name: 'Supersonique', family: 0 },
  { id: 'turbo', name: 'Pad de 100', family: 0 },
  { id: 'tire-screech', name: 'Powerslide', family: 0 },
  { id: 'clown-horn', name: 'Rule 1', family: 0 },
  { id: 'crash', name: 'Bump', family: 0 },
  { id: 'kick', name: 'Power shot', family: 1 },
  { id: 'crossbar', name: 'Crossbar', family: 1 },
  { id: 'bounce', name: 'Air dribble', family: 1 },
  { id: 'boing', name: 'Flip reset', family: 1 },
  { id: 'glass', name: 'Double tap', family: 1 },
  { id: 'air-horn', name: 'Hat trick', family: 2 },
  { id: 'whistle', name: 'Overtime', family: 2 },
  { id: 'buzzer', name: 'Zéro seconde', family: 2 },
  { id: 'countdown', name: 'Kickoff', family: 2 },
  { id: 'fireworks', name: 'Goal explosion', family: 2 },
  { id: 'crowd-cheer', name: 'What a save!', family: 3 },
  { id: 'applause', name: 'GG', family: 3 },
  { id: 'laughter', name: 'Whoops…', family: 3 },
  { id: 'wow', name: 'OMG!', family: 3 },
  { id: 'rimshot', name: 'Calculated.', family: 3 },
  { id: 'boo', name: 'FF ?', family: 4 },
  { id: 'donkey', name: 'Own goal', family: 4 },
  { id: 'chicken', name: 'Ballchaser', family: 4 },
  { id: 'sad-trombone', name: 'Hardstuck plat', family: 4 },
  { id: 'duck', name: 'Chat désactivé', family: 4 },
  { id: 'boxing-bell', name: 'Rumble', family: 5 },
  { id: 'slide-whistle', name: 'Snow Day', family: 5 },
  { id: 'siren', name: 'Heatseeker', family: 5 },
  { id: 'thunder', name: 'Dropshot', family: 5 },
  { id: 'cork-pop', name: 'Hoops', family: 5 },
  { id: 'cash-register', name: 'Titanium White', family: 6 },
  { id: 'drum-roll', name: 'Ouverture de caisse', family: 6 },
  { id: 'cymbal', name: 'Black market', family: 6 },
  { id: 'bugle', name: 'Rocket Pass', family: 6 },
  { id: 'gong', name: 'Alpha Boost', family: 6 },
  { id: 'explosion', name: 'Demo', family: 7 },
  { id: 'rocket-launch', name: 'Ceiling shot', family: 7 },
  { id: 'goat', name: 'Le GOAT', family: 7 },
  { id: 'rooster', name: 'Rocket Baguette', family: 7 },
  { id: 'victory-shout', name: 'SSL', family: 7 },
] as const satisfies readonly { id: string; name: string; family: number }[];

export type SoundId = (typeof sounds)[number]['id'];
export const soundIds = sounds.map((sound) => sound.id) as [SoundId, ...SoundId[]];

export const soundOf = (id: SoundId) => sounds.find((sound) => sound.id === id) ?? sounds[0];

/** What a sound just won completes, given every sound won so far, that one included. */
export function completedBy(sound: SoundId, won: ReadonlySet<SoundId>): { family: boolean; collection: boolean } {
  const { family } = soundOf(sound);
  return {
    family: sounds.every((other) => other.family !== family || won.has(other.id)),
    collection: sounds.every((other) => won.has(other.id)),
  };
}

/** Every sound has the same chance, those already won included. */
export const drawSound = (random = Math.random): SoundId =>
  soundIds[Math.floor(random() * soundIds.length)] ?? 'engine-rev';
