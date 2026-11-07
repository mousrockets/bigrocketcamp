import { FlameIcon, type LucideIcon, TargetIcon, TimerIcon, TrophyIcon } from 'lucide-react';
import { ChocolateIcon, HundredIcon } from '../components/club/badge-icons';
import type { PlayerStats, Streak } from './types';

export type BadgeRule = {
  id: string;
  icon: LucideIcon | typeof HundredIcon;
  label: string;
  earned: (player: PlayerStats, streak: Streak) => boolean;
};

export const badgeRules: BadgeRule[] = [
  { id: 'first', icon: TargetIcon, label: 'Premier effort', earned: (p) => p.done > 0 },
  { id: 'p100', icon: HundredIcon, label: '100 équiv. pompes', earned: (p) => p.done >= 100 },
  { id: 'p1000', icon: TrophyIcon, label: '1 000 équiv. pompes', earned: (p) => p.done >= 1000 },
  { id: 'plank10', icon: TimerIcon, label: '10 min de gainage', earned: (p) => p.plankSeconds >= 600 },
  { id: 'abs200', icon: ChocolateIcon, label: '200 abdos', earned: (p) => p.crunches >= 200 },
  { id: 'streak7', icon: FlameIcon, label: '7 jours d’affilée', earned: (_, s) => s.best >= 7 },
];
