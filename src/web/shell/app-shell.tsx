import { Link, Outlet, useMatchRoute, useSearch } from '@tanstack/react-router';
import { cn } from 'cn';
import { type ComponentType, type CSSProperties, useEffect, useRef } from 'react';
import { BoardProvider } from '../board';
import { MonthlyRecap } from '../challenges/recap-story';
import { SheetLink, useCloseSheet } from '../components/sheet-link';
import { buttonVariants } from '../components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '../components/ui/sidebar';
import { DeclareFlow } from '../declare/declare-flow';
import { RanksSheet } from '../team/ranks-sheet';
import { RulesSheet } from '../team/rules-sheet';
import { ClubBadge } from './club-badge';
import { useFreshVersion } from './fresh-version';
import { ChallengesIcon, MatchesIcon, PlusIcon, SettingsIcon, TeamIcon } from './icons';

// Around every tab: on a phone, a floating glass tab bar with the + to declare beside it; on a computer, a sidebar.

const tabs: {
  to: '/' | '/defis' | '/matchs' | '/reglages';
  label: string;
  Icon: ComponentType<{ size?: number }>;
  /** The pages opened from the tab that live outside its address, which keep it lit. */
  pages?: '/stats'[];
}[] = [
  { to: '/', label: 'L’équipe', Icon: TeamIcon, pages: ['/stats'] },
  { to: '/defis', label: 'Défis', Icon: ChallengesIcon },
  { to: '/matchs', label: 'Matchs', Icon: MatchesIcon },
  { to: '/reglages', label: 'Réglages', Icon: SettingsIcon },
];

/** Which tab is lit: the one whose address the page is at, or opened from. */
function useActiveTab(): number {
  const matchRoute = useMatchRoute();
  return tabs.findIndex(
    ({ to, pages = [] }) =>
      matchRoute({ to, fuzzy: to !== '/' }) || pages.some((page) => matchRoute({ to: page, fuzzy: true })),
  );
}

export function AppShell() {
  const { declarer = false, ranks = false, regles = false } = useSearch({ from: '/_shell' });
  const close = useCloseSheet();
  // A series being declared or still undoable keeps the page as it is: no reload to a newer build meanwhile.
  useFreshVersion(declarer);
  return (
    <BoardProvider>
      <DeclareFlow open={declarer} onClose={() => close('declarer')} />
      <RanksSheet open={ranks} onClose={() => close('ranks')} />
      <RulesSheet open={regles} onClose={() => close('regles')} />
      <MonthlyRecap />
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
  const active = useActiveTab();
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
            {tabs.map(({ to, label, Icon }, index) => (
              <SidebarMenuItem key={to} className="flex-[1_1_170px]">
                <SidebarMenuButton
                  size="nav"
                  isActive={index === active}
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

export function TabBar() {
  const active = useActiveTab();
  // The pill leaves a boost trail behind it, on the side it comes from.
  const previous = useRef(active);
  const from = previous.current;
  useEffect(() => {
    previous.current = active;
  }, [active]);
  return (
    <>
      {/* The shade under the tab bar, only in the installed app: in Safari, a full-width fixed element at the bottom
          stops the page above the toolbar and fills the rest of the screen with one flat colour. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-[130px] bg-linear-to-b from-black/0 to-black/72 lg:hidden [@media(display-mode:browser)]:hidden"
      />
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-4 bottom-[max(24px,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-[520px] items-center gap-2.5 lg:hidden"
      >
        <div className="glass relative grid h-[62px] flex-1 grid-cols-4 rounded-[31px] p-[5px]">
          {active >= 0 && (
            <i
              aria-hidden="true"
              className="tab-pill"
              style={{ '--tab': active, '--trail': Math.sign(from - active) } as CSSProperties}
            >
              {from !== active && <b key={active} className="tab-trail" />}
            </i>
          )}
          {tabs.map(({ to, label, Icon }, index) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === '/' }}
              // A page opened from the tab, outside its address, is still the tab's.
              aria-current={index === active ? 'page' : undefined}
              className={cn(
                buttonVariants({ variant: 'tab' }),
                'relative h-full aria-[current=page]:bg-transparent aria-[current=page]:shadow-none',
              )}
            >
              <Icon />
              {label}
            </Link>
          ))}
        </div>
        <SheetLink
          sheet="declarer"
          aria-label="Déclarer un exercice"
          className={cn(buttonVariants({ variant: 'glass' }), 'size-[62px]')}
        >
          <PlusIcon />
        </SheetLink>
      </nav>
    </>
  );
}
