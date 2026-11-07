import { Link, useRouterState } from '@tanstack/react-router';
import { cn } from 'cn';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { useBoardState } from '../../board/board-context';
import { standingsOf, tierOf } from '../../board/model';
import { useClub, useClubLogo } from '../../club';
import { buttonVariants } from '../ui/button';
import { ChallengeIcon, ClubIcon, ExercisesIcon, MatchIcon, PlusIcon, ProfileIcon } from './icons';
import { type NavTarget, navSectionOf } from './nav-section';
import { PlayerAvatar } from './player-avatar';

// The frame of every signed-in page: a tab bar at the bottom of a phone, a side bar on a wide screen.

interface NavItem {
  to: NavTarget;
  label: string;
  /** The side bar has room for the long name. */
  wideLabel?: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Phones reach it from the profile: four tabs and the action button fill the bar. */
  wideOnly?: boolean;
}

const navItems: NavItem[] = [
  { to: '/', label: 'Club', icon: ClubIcon },
  { to: '/matchs', label: 'Matchs', icon: MatchIcon },
  { to: '/exercices', label: 'Exercices', icon: ExercisesIcon, wideOnly: true },
  { to: '/defi', label: 'Défi', wideLabel: 'Défi du mois', icon: ChallengeIcon },
  { to: '/profil', label: 'Profil', icon: ProfileIcon },
];

const roleLabels = { admin: 'admin', member: 'membre' } as const;

/** The entry to light: the page's own, or its parent's for a page the bar does not list. */
function useNavSection(wide: boolean): NavTarget | null {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return navSectionOf(pathname, wide);
}

/** The club's picture and name, as its administrators set them. */
export function ClubMark({ className }: { className?: string | undefined }) {
  const logo = useClubLogo();
  return (
    <img
      src={logo}
      alt=""
      width={36}
      height={36}
      className={cn('size-9 shrink-0 rounded-[10px] bg-inverse object-cover', className)}
    />
  );
}

function ClubIdentity({ compact = false }: { compact?: boolean }) {
  const { name, roster } = useClub();
  return (
    <Link
      to="/"
      className="flex min-w-0 items-center gap-2.5 text-foreground no-underline hover:no-underline"
      aria-label={`${name}, accueil`}
    >
      <ClubMark className={compact ? 'size-[34px]' : undefined} />
      <span className="flex min-w-0 flex-col gap-px">
        <span className="truncate font-display text-[19px] leading-none lg:text-lg">{name}</span>
        <span className={cn('text-xs text-muted-foreground', compact ? 'font-medium' : 'font-normal')}>
          {roster.length} joueur{roster.length > 1 ? 's' : ''} · 2v2 classé
        </span>
      </span>
    </Link>
  );
}

/** The signed-in member's 2v2 tier, as the side bar shows it under their name. */
function useMyTier(pseudo: string): string | null {
  const { roster } = useClub();
  const { data } = useBoardState();
  const rank = data ? standingsOf(roster, data).find(({ name }) => name === pseudo)?.rank : null;
  return rank?.tier != null ? tierOf(rank.label) : null;
}

// The design's .side: flex 1 1 220px beside a main of flex 999 1 560px, so 220 px and a hair at any width.
function SideBar({ onDeclare }: { onDeclare: () => void }) {
  const { me, roster } = useClub();
  const pseudo = me.duoPseudo ?? me.email;
  const tier = useMyTier(pseudo);
  const section = useNavSection(true);
  return (
    <aside
      aria-label="Barre latérale"
      className="sticky top-0 hidden h-dvh min-w-0 flex-[1_1_220px] flex-col gap-[22px] border-r border-sidebar-border bg-sidebar px-4 py-7 lg:flex"
    >
      <div className="px-1.5">
        <ClubIdentity />
      </div>
      <button
        type="button"
        onClick={onDeclare}
        className={cn(buttonVariants({ variant: 'action', size: 'cta' }), 'w-full')}
      >
        <PlusIcon className="size-[18px]" />
        Déclarer un exercice
      </button>
      <nav aria-label="Navigation principale" className="flex flex-col gap-1">
        {navItems.map(({ to, label, wideLabel, icon: NavIcon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: true }}
            aria-current={section === to ? 'page' : undefined}
            className="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold text-muted-foreground hover:bg-hover hover:text-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-foreground"
          >
            <NavIcon className="size-5" />
            {wideLabel ?? label}
          </Link>
        ))}
      </nav>
      <Link
        to="/profil"
        className="mt-auto flex items-center gap-2.5 rounded-[14px] bg-card p-2.5 text-foreground hover:text-foreground"
      >
        <PlayerAvatar
          name={pseudo}
          me
          index={Math.max(0, roster.indexOf(pseudo))}
          className="size-[34px] [&_[data-slot=avatar-fallback]]:text-xs"
        />
        <span className="flex min-w-0 flex-col gap-px">
          <b className="truncate text-sm font-semibold">{pseudo}</b>
          <small className="truncate text-xs text-muted-foreground">
            {[tier, roleLabels[me.role]].filter(Boolean).join(' · ')}
          </small>
        </span>
      </Link>
    </aside>
  );
}

// The design's .tb: 86 px tall where nothing sits under it (26 px kept for a phone's home bar), five columns,
// the blue 54 px button in the middle.
function TabBar({ onDeclare }: { onDeclare: () => void }) {
  const [club, matches, , challenge, profile] = navItems as [NavItem, NavItem, NavItem, NavItem, NavItem];
  const section = useNavSection(false);
  const tab = ({ to, label, icon: NavIcon }: NavItem) => (
    <Link
      key={to}
      to={to}
      activeOptions={{ exact: true }}
      aria-current={section === to ? 'page' : undefined}
      className="flex min-h-11 flex-col items-center justify-center gap-[3px] text-[10px] font-semibold text-dim hover:text-foreground aria-[current=page]:text-foreground"
    >
      <NavIcon />
      {label}
    </Link>
  );
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 grid h-[calc(60px+max(env(safe-area-inset-bottom),26px))] grid-cols-5 items-center border-t border-(--tab-bar-border) bg-(--tab-bar) px-2.5 pt-2 pb-[max(env(safe-area-inset-bottom),26px)] backdrop-blur-xl backdrop-saturate-[1.6] lg:hidden"
    >
      {tab(club)}
      {tab(matches)}
      <button
        type="button"
        onClick={onDeclare}
        aria-label="Déclarer un exercice"
        className="flex size-[54px] items-center justify-center justify-self-center rounded-[18px] bg-primary transition-transform active:scale-95 text-primary-foreground shadow-[0_6px_18px_var(--primary-glow)]"
      >
        <PlusIcon />
      </button>
      {tab(challenge)}
      {tab(profile)}
    </nav>
  );
}

/** A phone's top bar on the club's home: who we are. Other pages carry their own title. */
export function ClubHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="flex h-11 items-center justify-between gap-3 lg:hidden">
      <ClubIdentity compact />
      {children}
    </header>
  );
}

export function AppShell({ children, onDeclare }: { children: ReactNode; onDeclare: () => void }) {
  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-inverse px-4 py-2 text-inverse-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Aller au contenu
      </a>
      <SideBar onDeclare={onDeclare} />
      <main
        id="main"
        className="relative min-w-0 flex-1 overflow-x-clip px-4 pt-[calc(env(safe-area-inset-top)+14px)] pb-[calc(94px+max(env(safe-area-inset-bottom),26px))] lg:flex-[999_1_560px] lg:px-[clamp(16px,4vw,48px)] lg:pt-8 lg:pb-14"
      >
        <div className="relative mx-auto flex max-w-[1180px] flex-col gap-3.5 lg:gap-5">{children}</div>
      </main>
      <TabBar onDeclare={onDeclare} />
    </div>
  );
}
