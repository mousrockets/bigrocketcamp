import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, Outlet, useMatchRoute, useNavigate } from '@tanstack/react-router';
import { cn } from 'cn';
import { useEffect, useSyncExternalStore } from 'react';
import { isSignInRequired, subscribeToSignInRequired } from './api';
import { ClubContext, ClubLogoContext, ClubNameContext } from './club';
import { AppShell } from './components/club/app-shell';
import { EmptyPitch } from './components/club/icons';
import { buttonVariants } from './components/ui/button';
import { Toaster } from './components/ui/sonner';
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

function Unavailable() {
  return (
    <main>
      <section className="sign-in">
        <h1>Club injoignable</h1>
        <p className="muted">
          Le club ne répond pas pour l’instant. Vérifie ta connexion : la page réessaie toute seule.
        </p>
      </section>
    </main>
  );
}

const noIdentity = { name: '', logo: null };

/** Stands in front of every page: signing in, then the club, then a new member's profile. */
export function App() {
  const signInRequired = useSyncExternalStore(subscribeToSignInRequired, isSignInRequired);
  const { data: club = null, isError: failed } = useQuery(clubQuery);
  const { data: identity = noIdentity } = useQuery({ ...clubIdentityQuery, enabled: signInRequired });
  const onProfile = useMatchRoute()({ to: '/profil' }) !== false;
  const navigate = useNavigate();
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
  if (club.me.duoPseudo === null && !onProfile) return <Navigate to="/profil" replace />;
  return (
    <ClubNameContext value={club.name}>
      <ClubLogoContext value={club.logo}>
        <ClubContext value={club}>
          <AppShell onDeclare={() => navigate({ to: '/', hash: 'exercise' })}>
            <Outlet />
          </AppShell>
          <Toaster position="top-center" />
        </ClubContext>
      </ClubLogoContext>
    </ClubNameContext>
  );
}
