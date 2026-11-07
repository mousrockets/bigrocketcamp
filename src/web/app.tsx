import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet } from '@tanstack/react-router';
import { cn } from 'cn';
import { LoaderCircleIcon } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { isSignInRequired, subscribeToSignInRequired } from './api';
import { BoardProvider } from './board/board-context';
import { ClubContext, ClubLogoContext, ClubNameContext } from './club';
import { AppShell } from './components/club/app-shell';
import { EmptyPitch } from './components/club/icons';
import { Button, buttonVariants } from './components/ui/button';
import { Toaster } from './components/ui/sonner';
import { DeclareProvider, useDeclare } from './declare/declare-context';
import { WelcomePage } from './pages/welcome';
import { clubIdentityQuery, clubQuery } from './queries';
import { SignIn } from './sign-in';
import { useTheme } from './theme';

export function NotFound() {
  return (
    <section className="flex flex-col items-center gap-4 py-24 text-center">
      <EmptyPitch />
      <span className="kicker">Erreur 404</span>
      <h1 className="font-display text-4xl leading-none">Page introuvable</h1>
      <p className="max-w-sm text-[15px] text-soft">Cette adresse ne correspond à aucune page du club.</p>
      <Link to="/" className={cn(buttonVariants({ variant: 'inverse', size: 'xl' }), 'mt-2')}>
        Retour au club
      </Link>
    </section>
  );
}

function Shell() {
  const { openDeclare } = useDeclare();
  return (
    <AppShell onDeclare={() => openDeclare()}>
      <Outlet />
    </AppShell>
  );
}

function Unavailable() {
  const queryClient = useQueryClient();
  const [trying, setTrying] = useState(false);
  return (
    <main className="flex min-h-dvh flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+16px)] pb-[max(env(safe-area-inset-bottom),48px)] text-foreground lg:items-center lg:justify-center">
      <div className="flex flex-1 flex-col items-center justify-center gap-[18px] text-center lg:max-w-[520px] lg:flex-none">
        <EmptyPitch />
        <span className="kicker text-destructive">Hors ligne</span>
        <h1 className="font-display text-4xl leading-none lg:text-5xl">Club injoignable</h1>
        <p className="text-[15px] leading-[1.45] text-balance text-soft lg:text-base">
          Le club ne répond pas pour l’instant. Vérifie ta connexion : l’app réessaie toute seule.
        </p>
        <p role="status" className="mt-1 flex items-center gap-2 text-[13px] text-muted-foreground">
          <LoaderCircleIcon aria-hidden="true" className="size-4 animate-spin" />
          Nouvelle tentative dès que le réseau revient
        </p>
      </div>
      <Button
        variant="outline"
        size="xl"
        disabled={trying}
        onClick={async () => {
          setTrying(true);
          await queryClient.refetchQueries(clubQuery).catch(() => undefined);
          setTrying(false);
        }}
        className="h-[52px] w-full rounded-[14px] border-white/14 bg-transparent font-display lg:mt-8 lg:w-auto lg:px-7 dark:bg-transparent"
      >
        {trying ? 'Connexion…' : 'Réessayer'}
      </Button>
    </main>
  );
}

const noIdentity = { name: '', logo: null };

/** Stands in front of every page: signing in, then the club, then a new member's profile. */
export function App() {
  const signInRequired = useSyncExternalStore(subscribeToSignInRequired, isSignInRequired);
  const { data: club = null, isError: failed } = useQuery(clubQuery);
  const { data: identity = noIdentity } = useQuery({ ...clubIdentityQuery, enabled: signInRequired });
  useTheme();

  const clubName = club?.name ?? identity.name;
  useEffect(() => {
    if (!clubName) return;
    document.title = `${clubName} · Le club`;
    // The name under the icon on an iPhone home screen (Android reads the manifest).
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', clubName);
  }, [clubName]);

  if (signInRequired) {
    return (
      <ClubNameContext value={identity.name}>
        <ClubLogoContext value={identity.logo}>
          <SignIn />
        </ClubLogoContext>
      </ClubNameContext>
    );
  }
  if (failed) return <Unavailable />;
  if (!club) return null;
  // A new member chooses their duo pseudo before anything else: every game record is keyed by it.
  if (club.me.duoPseudo === null) {
    return (
      <ClubNameContext value={club.name}>
        <ClubLogoContext value={club.logo}>
          <ClubContext value={club}>
            <WelcomePage />
          </ClubContext>
        </ClubLogoContext>
      </ClubNameContext>
    );
  }
  return (
    <ClubNameContext value={club.name}>
      <ClubLogoContext value={club.logo}>
        <ClubContext value={club}>
          <BoardProvider>
            <DeclareProvider>
              <Shell />
            </DeclareProvider>
          </BoardProvider>
          <Toaster position="top-center" />
        </ClubContext>
      </ClubLogoContext>
    </ClubNameContext>
  );
}
