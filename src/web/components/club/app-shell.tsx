import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { useClub, useClubLogo } from '../../club';
import { buttonVariants } from '../ui/button';
import { ChallengeIcon, ClubIcon, ExercisesIcon, MatchIcon, PlusIcon, ProfileIcon } from './icons';
import { PlayerAvatar } from './player-avatar';

// The frame of every signed-in page: a tab bar at the bottom of a phone, a side bar on a wide screen.

type NavTarget = '/' | '/matchs' | '/exercices' | '/defi' | '/profil';

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
        <span className="text-xs font-medium text-muted-foreground">
          {roster.length} joueur{roster.length > 1 ? 's' : ''} · 2v2 classé
        </span>
      </span>
    </Link>
  );
}

function SideBar({ onDeclare }: { onDeclare: () => void }) {
  const { me, roster } = useClub();
  const pseudo = me.duoPseudo ?? me.email;
  return (
    <aside
      aria-label="Barre latérale"
      className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-[22px] border-r border-sidebar-border bg-sidebar px-4 py-7 lg:flex"
    >
      <div className="px-1.5">
        <ClubIdentity />
      </div>
      <button
        type="button"
        onClick={onDeclare}
        className={cn(buttonVariants({ variant: 'action', size: 'xl' }), 'h-12 w-full text-base')}
      >
        <PlusIcon className="size-[18px]" />
        Déclarer un exercice
      </button>
      <nav aria-label="Navigation principale" className="flex flex-col gap-1">
        {navItems.map(({ to, label, wideLabel, icon: NavIcon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === '/' }}
            className="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold text-muted-foreground no-underline hover:bg-[#121317] hover:text-foreground hover:no-underline aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-foreground"
          >
            <NavIcon className="size-5" />
            {wideLabel ?? label}
          </Link>
        ))}
      </nav>
      <Link
        to="/profil"
        className="mt-auto flex items-center gap-2.5 rounded-[14px] bg-card p-2.5 text-foreground no-underline hover:no-underline"
      >
        <PlayerAvatar name={pseudo} me index={Math.max(0, roster.indexOf(pseudo))} />
        <span className="flex min-w-0 flex-col gap-px">
          <b className="truncate text-sm font-semibold">{pseudo}</b>
          <small className="text-xs text-muted-foreground">{roleLabels[me.role]}</small>
        </span>
      </Link>
    </aside>
  );
}

function TabBar({ onDeclare }: { onDeclare: () => void }) {
  const [club, matches, , challenge, profile] = navItems as [NavItem, NavItem, NavItem, NavItem, NavItem];
  const tab = ({ to, label, icon: NavIcon }: NavItem) => (
    <Link
      key={to}
      to={to}
      activeOptions={{ exact: to === '/' }}
      className="flex min-h-11 flex-col items-center justify-center gap-[3px] text-[10px] font-semibold text-[#7d7f86] no-underline hover:text-foreground hover:no-underline aria-[current=page]:text-foreground"
    >
      <NavIcon />
      {label}
    </Link>
  );
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-center border-t border-border bg-(--tab-bar) px-2.5 pt-2 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur-xl backdrop-saturate-150 lg:hidden"
    >
      {tab(club)}
      {tab(matches)}
      <button
        type="button"
        onClick={onDeclare}
        aria-label="Déclarer un exercice"
        className="flex size-[54px] items-center justify-center justify-self-center rounded-[18px] bg-primary text-primary-foreground shadow-[0_6px_18px_color-mix(in_srgb,var(--primary)_35%,transparent)]"
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
        className="relative min-w-0 flex-1 px-4 pt-[calc(env(safe-area-inset-top)+14px)] pb-[calc(env(safe-area-inset-bottom)+112px)] lg:px-[clamp(16px,4vw,48px)] lg:pt-8 lg:pb-14"
      >
        <div className="relative mx-auto flex max-w-[1180px] flex-col gap-3.5 lg:gap-5">{children}</div>
      </main>
      <TabBar onDeclare={onDeclare} />
    </div>
  );
}
