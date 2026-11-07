import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, Outlet, useMatchRoute } from '@tanstack/react-router';
import { useEffect, useSyncExternalStore } from 'react';
import { isSignInRequired, subscribeToSignInRequired } from './api';
import { Brand } from './brand';
import { ClubContext, ClubLogoContext, ClubNameContext } from './club';
import { clubIdentityQuery, clubQuery } from './queries';
import { SignIn } from './sign-in';

export function NotFound() {
  return (
    <main>
      <header>
        <Brand />
        <Link className="back-link" to="/" reloadDocument>
          ← Retour au tableau
        </Link>
      </header>
      <section>
        <p className="eyebrow">ERREUR 404</p>
        <h1>Page introuvable</h1>
        <p className="muted">Cette adresse ne correspond à aucune page du club.</p>
      </section>
    </main>
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
          <Outlet />
        </ClubContext>
      </ClubLogoContext>
    </ClubNameContext>
  );
}
