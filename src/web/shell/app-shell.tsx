import { Link, Outlet } from '@tanstack/react-router';
import type { ComponentType } from 'react';
import { BoardProvider } from '../board';
import { ClubBadge } from './club-badge';
import { useFreshVersion } from './fresh-version';
import { ChallengesIcon, MatchesIcon, PlusIcon, SettingsIcon, TeamIcon } from './icons';

// Around every tab: on a phone, a floating glass tab bar with the + to declare beside it; on a computer, a sidebar.

const tabs: { to: '/' | '/defis' | '/matchs' | '/reglages'; label: string; Icon: ComponentType<{ size?: number }> }[] =
  [
    { to: '/', label: 'L’équipe', Icon: TeamIcon },
    { to: '/defis', label: 'Défis', Icon: ChallengesIcon },
    { to: '/matchs', label: 'Matchs', Icon: MatchesIcon },
    { to: '/reglages', label: 'Réglages', Icon: SettingsIcon },
  ];

export function AppShell() {
  useFreshVersion();
  return (
    <BoardProvider>
      <div className="flex min-h-dvh flex-wrap bg-black text-t1">
        <Sidebar />
        <div className="relative min-w-0 flex-[999_1_560px]">
          <Outlet />
        </div>
        <TabBar />
      </div>
    </BoardProvider>
  );
}

function Sidebar() {
  return (
    <aside
      aria-label="Barre latérale"
      className="sticky top-0 hidden h-dvh min-w-0 flex-[1_1_220px] flex-col gap-7 self-start border-line border-r px-3.5 py-7 lg:flex"
    >
      <ClubBadge className="px-2" />
      <nav aria-label="Navigation principale" className="flex flex-wrap gap-0.5">
        {tabs.map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === '/' }}
            className="flex h-10 flex-[1_1_170px] items-center gap-3 rounded-[10px] px-3 font-medium text-[14px] text-t2 transition-colors duration-300 hover:bg-white/4 hover:text-t1 aria-[current=page]:bg-white/7 aria-[current=page]:text-t1"
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

function TabBar() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-[130px] bg-linear-to-b from-black/0 to-black/72 lg:hidden"
      />
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-4 bottom-[max(24px,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-[520px] items-center gap-2.5 lg:hidden"
      >
        <div className="glass grid h-[62px] flex-1 grid-cols-4 rounded-[31px] p-[5px]">
          {tabs.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === '/' }}
              className="relative flex flex-col items-center justify-center gap-0.5 rounded-[26px] font-semibold text-[10px] text-t2 tracking-[.01em] transition-colors duration-300 aria-[current=page]:bg-white/13 aria-[current=page]:text-t1 aria-[current=page]:shadow-[inset_0_.5px_0_rgba(255,255,255,.28),0_2px_8px_rgba(0,0,0,.25)] [&_svg]:size-[22px]"
            >
              <Icon />
              {label}
            </Link>
          ))}
        </div>
        <Link
          to="/declarer"
          aria-label="Déclarer un exercice"
          className="glass flex size-[62px] shrink-0 items-center justify-center rounded-full text-t1 transition-transform duration-300 ease-(--ease) active:scale-94"
        >
          <PlusIcon />
        </Link>
      </nav>
    </>
  );
}
