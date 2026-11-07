import {
  ChocolateIcon,
  CupIcon,
  FlameBadgeIcon,
  HundredIcon,
  PlankIcon,
  TargetBadgeIcon,
} from '../components/club/badge-icons';
import type { PlayerStats, Streak } from './types';

export type BadgeRule = {
  id: string;
  icon: typeof HundredIcon;
  label: string;
  earned: (player: PlayerStats, streak: Streak) => boolean;
};

export const badgeRules: BadgeRule[] = [
  { id: 'first', icon: TargetBadgeIcon, label: 'Premier effort', earned: (p) => p.done > 0 },
  { id: 'p100', icon: HundredIcon, label: '100 équiv. pompes', earned: (p) => p.done >= 100 },
  { id: 'p1000', icon: CupIcon, label: '1 000 équiv. pompes', earned: (p) => p.done >= 1000 },
  { id: 'plank10', icon: PlankIcon, label: '10 min de gainage', earned: (p) => p.plankSeconds >= 600 },
  { id: 'abs200', icon: ChocolateIcon, label: '200 abdos', earned: (p) => p.crunches >= 200 },
  { id: 'streak7', icon: FlameBadgeIcon, label: '7 jours d’affilée', earned: (_, s) => s.best >= 7 },
];
