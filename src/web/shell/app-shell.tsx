import { Link, Outlet, useMatchRoute } from '@tanstack/react-router';
import type { ComponentType, CSSProperties } from 'react';
import { BoardProvider } from '../board';
import { Button } from '../components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '../components/ui/sidebar';
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
      <SidebarProvider className="flex-wrap bg-black text-t1" style={{ '--sidebar-width': 'auto' } as CSSProperties}>
        <AppSidebar />
        <div className="relative min-w-0 flex-[999_1_560px]">
          <Outlet />
        </div>
        <TabBar />
      </SidebarProvider>
    </BoardProvider>
  );
}

function AppSidebar() {
  const matchRoute = useMatchRoute();
  return (
    <Sidebar
      collapsible="none"
      aria-label="Barre latérale"
      className="sticky top-0 hidden h-dvh min-w-0 flex-[1_1_220px] gap-7 self-start border-line border-r px-3.5 py-7 lg:flex"
    >
      <SidebarHeader className="p-0">
        <ClubBadge className="px-2" />
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Navigation principale">
          <SidebarMenu className="flex-row flex-wrap gap-0.5">
            {tabs.map(({ to, label, Icon }) => (
              <SidebarMenuItem key={to} className="flex-[1_1_170px]">
                <SidebarMenuButton
                  size="nav"
                  isActive={Boolean(matchRoute({ to }))}
                  render={<Link to={to} activeOptions={{ exact: to === '/' }} />}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </nav>
      </SidebarContent>
    </Sidebar>
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
            <Button
              key={to}
              variant="tab"
              className="h-full"
              nativeButton={false}
              render={<Link to={to} activeOptions={{ exact: to === '/' }} />}
            >
              <Icon />
              {label}
            </Button>
          ))}
        </div>
        <Button
          variant="glass"
          className="size-[62px]"
          aria-label="Déclarer un exercice"
          nativeButton={false}
          render={<Link to="/declarer" />}
        >
          <PlusIcon />
        </Button>
      </nav>
    </>
  );
}
