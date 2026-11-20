import { count } from './format';

// The daily reminder's words: the pushups owed, or the day settled, with a joke from the club's own vocabulary.
// Each member goes through a category in their own shuffled order, one message a day: none comes back before the
// whole category has been read.

/** Never more than this many pushups: a small debt, done in a series or two. */
export const smallDebt = 30;

export const reminderCategories = ['small', 'big', 'grew', 'shrank', 'cleared'] as const;
export type ReminderCategory = (typeof reminderCategories)[number];

/** `{gap}` is the change since the last reminder, "15 pompes": only `grew` and `shrank` say it. */
export const reminderMessages: Record<ReminderCategory, readonly string[]> = {
  small: [
    'Trois séries et c’est plié. Plus rapide qu’un kickoff 🚀',
    'Petit reste à rendre. Même un Bronze y arriverait 😅',
    'Une série vite fait, comme un free play avant la ranked 💪',
    'Pas grand-chose. Règle ça avant que ça tourne au ceiling shot raté.',
    'Dix minutes de tapis et tu repars full boost ⚽',
    'Rien de méchant : rends-les et garde ta streak propre.',
    'Petit whiff, petite dette. Un aller-retour au sol et c’est réglé.',
    'Tu les fais en moins de temps qu’une prolongation 🔥',
    'Même pas besoin de flip reset pour ça. Juste des bras.',
    'Ta dette tient sur une main. Les deux au sol, maintenant 🫡',
    'Un petit effort et ton MMR moral remonte.',
    'Ça se règle plus vite qu’un FF à 0-4.',
    'Petit reliquat. Un vrai Champion ne laisse rien traîner 🏆',
    'Rends-les maintenant, la ranked t’attendra l’esprit léger.',
    'Une série, un GG, et on n’en parle plus 💪',
  ],
  big: [
    'Ça commence à faire une sacrée pile. Le tapis t’attend 🥵',
    'Même un SSL n’a pas autant de boost à rendre.',
    'Tu joues en Diamond mais tu rembourses en Bronze 😅',
    'À ce rythme, ta dette va finir Grand Champion 🏆',
    'Grosse ardoise. Découpe-la en séries, comme une rotation propre.',
    'Ta dette a un meilleur peak que ton MMR 🔥',
    'Le club appelle ça un own goal. Remonte au score 💪',
    'Respire, pose les mains, et enchaîne les séries comme des demos.',
    'Pas de FF possible ici. Que des séries.',
    'Ça sent le marathon. Bois un verre d’eau et lance-toi 🥵',
    'Même en prolongation infinie, elle ne partira pas toute seule.',
    'Ta dette est Champion III. Fais-la redescendre en Bronze 🫡',
    'Gros chantier. Chaque série compte comme un save.',
  ],
  grew: [
    '{gap} de plus depuis hier. Les défaites ont fait des heures sup 😅',
    'La dette a pris {gap} depuis hier. Grosse session ranked, hein ?',
    '{gap} de plus. Le whiff coûte cher dans ce club 🥵',
    'Depuis hier : {gap} de plus. Le ballon n’a pas été ton ami.',
    'Depuis hier, {gap} de plus. Un vrai farm à l’envers 🔥',
    'Ta dette a fait un flip reset : {gap} de plus depuis hier.',
    '{gap} de plus depuis hier. Moins de ranked, plus de tapis ?',
    'Les adversaires t’ont offert {gap} depuis hier. Rends-les vite 💪',
    '{gap} de plus. Ça sent le tilt de fin de session 😅',
    '{gap} de plus depuis hier. Le kickoff était raté, pas la journée.',
    '{gap} de plus depuis hier. Les demos font mal, hein ?',
    'Plus {gap} depuis hier. Le club compte, toi tu pousses 🫡',
  ],
  shrank: [
    '{gap} de moins depuis hier. Ça remonte comme un MMR en win streak 🚀',
    'Bien joué : {gap} de moins depuis hier. Continue sur cette lancée 💪',
    '{gap} de moins depuis hier. Propre comme un ceiling shot.',
    'Depuis hier, la dette a fondu de {gap}. Le peak est derrière toi 🔥',
    '{gap} de moins. Encore un effort et c’est GG.',
    'Depuis hier, {gap} en moins. Rotation parfaite 🫡',
    'La dette a perdu {gap} depuis hier. Le club a vu, le club valide.',
    'Ça descend : {gap} de moins. Full boost jusqu’à zéro 🚀',
    'Encore {gap} de moins depuis hier. On sent le Grand Champion du tapis.',
    'La dette a pris une demo : {gap} de moins depuis hier ⚽',
    '{gap} de moins. Tes bras font du free play, et ça paie 💪',
    'Belle remontée : {gap} de moins depuis hier. Pas de FF, que des séries.',
  ],
  cleared: [
    'Zéro pompe à rendre. Lance une ranked l’esprit tranquille 🚀',
    'Dette à zéro. Même un SSL serait jaloux de ta discipline 🏆',
    'Rien à rendre. Profite, c’est free play aujourd’hui ⚽',
    'Ardoise propre. GG, champion 🫡',
    'Zéro dette. Ton seul adversaire, c’est le kickoff.',
    'Tout est rendu. Tes bras méritent une pause 💪',
    'Dette soldée. Tu peux whiff tranquille… enfin presque 😅',
    'Rien à faire au tapis. Va chercher ton peak.',
    'Compte à zéro. Le club t’envoie un « What a save! » bien mérité.',
    'Clean sheet sur la dette. Gardien de l’année 🧤',
    'Zéro pompe. La seule chose qui doit monter, c’est ton MMR 🚀',
    'Tout est payé. Grand Champion de la régularité 🏆',
    'Rien à rendre. Tu peux même tenter le flip reset sans pression.',
    'Dette à zéro. Le tapis se repose, toi aussi 😌',
    'Plus rien à rendre. Profite de ta streak sans culpabiliser 🔥',
    'Zéro. Nada. Que dalle. Va jouer ⚽',
    'Ardoise effacée. Les autres peuvent prendre exemple 🫡',
    'Rien au compteur. Un ceiling shot de discipline 🚀',
    'Tu es à jour. Même le ballon est fier de toi.',
    'Dette à zéro. Aucun FF dans ta discipline 💪',
    'Rien à rendre. Boost illimité pour le reste de la journée.',
    'Propre. Net. Diamond de la régularité, minimum.',
    'Zéro pompe due. Va montrer ce que tu vaux en ranked 🔥',
    'Rien à faire. Même ton coéquipier ne peut rien te reprocher 😅',
    'Dette soldée. Tu peux lancer le kickoff de la soirée sereinement.',
    'Zéro à rendre. Le club valide, le canapé aussi 🛋️',
    'Plus une seule pompe. Champion de la constance 🏆',
    'Ta dette est Unranked. Exactement là où elle doit être 🫡',
  ],
};

/** The title of the day settled: the member knows at a glance there is nothing left to do today. */
export const clearedTitle = 'C’est bon pour aujourd’hui';

/** What the service worker receives (src/web/sw/notifications.ts reads it). */
export interface ReminderPush {
  title: string;
  body: string;
  /** The page a tap opens. */
  url: string;
  /** A new reminder replaces the previous one still shown. */
  tag: string;
}

export const reminderTag = 'daily-reminder';
/** A tap on a reminder of pushups owed opens the declaration sheet over L'équipe. */
export const declareUrl = '/?declarer=true';

/** The category of today's reminder, from today's debt and the one the last reminder announced. */
export function reminderCategory(debt: number, lastDebt: number | null): ReminderCategory {
  if (debt <= 0) return 'cleared';
  if (lastDebt !== null && debt > lastDebt) return 'grew';
  if (lastDebt !== null && debt < lastDebt) return 'shrank';
  return debt <= smallDebt ? 'small' : 'big';
}

/** A number from a text, the same each time: the seed of a member's order. */
function hashOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32: a small generator, the same numbers for the same seed. */
function generator(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** The member's own order of a category's messages: a shuffle that never changes. */
export function messageOrder(memberId: string, category: ReminderCategory): number[] {
  const random = generator(hashOf(`${memberId}:${category}`));
  const order = reminderMessages[category].map((_, index) => index);
  for (let index = order.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [order[index], order[other]] = [order[other] ?? 0, order[index] ?? 0];
  }
  return order;
}

/** Days since 1 January 1970: one more message each day. */
const dayNumber = (day: string) => Math.floor(Date.parse(`${day}T12:00:00Z`) / 86_400_000);

/** The message of a category a member reads on a day: the next one of their order. */
export function messageOf(memberId: string, category: ReminderCategory, day: string): string {
  const stock = reminderMessages[category];
  const order = messageOrder(memberId, category);
  return stock[order[dayNumber(day) % order.length] ?? 0] ?? '';
}

export interface ReminderFacts {
  memberId: string;
  /** The Paris day it is sent. */
  day: string;
  /** What the app shows: `debt.left`. */
  debt: number;
  /** What the previous reminder announced; null for a first one. */
  lastDebt: number | null;
}

/** Today's notification: the pushups owed and a joke, or the day settled. */
export function reminderPush({ memberId, day, debt, lastDebt }: ReminderFacts): ReminderPush {
  const category = reminderCategory(debt, lastDebt);
  const gap = count(Math.abs(debt - (lastDebt ?? debt)), 'pompe');
  const body = messageOf(memberId, category, day).replace('{gap}', gap);
  if (category === 'cleared') return { title: clearedTitle, body, url: '/', tag: reminderTag };
  return { title: `${count(debt, 'pompe')} à rendre`, body, url: declareUrl, tag: reminderTag };
}
