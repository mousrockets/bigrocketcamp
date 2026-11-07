import type { PlayerStats, Streak } from './types';

export type BadgeRule = {
  id: string;
  emoji: string;
  label: string;
  earned: (player: PlayerStats, streak: Streak) => boolean;
};

export const badgeRules: BadgeRule[] = [
  { id: 'first', emoji: '🎯', label: 'Premier effort', earned: (p) => p.done > 0 },
  { id: 'p100', emoji: '💯', label: '100 équiv. pompes', earned: (p) => p.done >= 100 },
  { id: 'p1000', emoji: '🏆', label: '1 000 équiv. pompes', earned: (p) => p.done >= 1000 },
  { id: 'plank10', emoji: '🧱', label: '10 min de gainage', earned: (p) => p.plankSeconds >= 600 },
  { id: 'abs200', emoji: '🍫', label: '200 abdos', earned: (p) => p.crunches >= 200 },
  { id: 'streak7', emoji: '🔥', label: '7 jours d’affilée', earned: (_, s) => s.best >= 7 },
];
