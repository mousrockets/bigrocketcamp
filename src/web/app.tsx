import { useQuery } from '@tanstack/react-query';
import { Link, Outlet } from '@tanstack/react-router';
import { useEffect, useSyncExternalStore } from 'react';
import { GatePage, GateTitle, Kicker } from './access/gate';
import { SignIn } from './access/sign-in';
import { Unreachable } from './access/unreachable';
import { Welcome } from './access/welcome';
import { isSignInRequired, subscribeToSignInRequired } from './api';
import { ClubContext, ClubLogoContext, ClubNameContext } from './club';
import { clubIdentityQuery, clubQuery } from './queries';

export function NotFound() {
  return (
    <GatePage className="justify-center">
      <div className="mx-auto flex w-full max-w-[400px] flex-col items-center gap-3.5 text-center">
        <Kicker>ERREUR 404</Kicker>
        <GateTitle className="text-[40px] lg:text-[44px]">Hors du terrain</GateTitle>
        <p className="m-0 text-[15px] leading-[1.45] text-gate-soft">Cette adresse ne mène à aucune page du club.</p>
        <Link to="/" reloadDocument className="min-h-11 content-center font-semibold text-[14px] text-gate-link">
          Retour à l’équipe
        </Link>
      </div>
    </GatePage>
  );
}

const noIdentity = { name: '', logo: null };

/** Stands in front of every page: signing in, then the club, then a new member's first visit. */
export function App() {
  const signInRequired = useSyncExternalStore(subscribeToSignInRequired, isSignInRequired);
  const { data: club = null, isError: failed, refetch, isFetching } = useQuery(clubQuery);
  const { data: identity = noIdentity } = useQuery({ ...clubIdentityQuery, enabled: signInRequired });

  const clubName = club?.name ?? identity.name;
  useEffect(() => {
    if (!clubName) return;
    document.title = clubName;
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
  if (failed) return <Unreachable retry={() => refetch()} retrying={isFetching} />;
  if (!club) return null;
  return (
    <ClubNameContext value={club.name}>
      <ClubLogoContext value={club.logo}>
        <ClubContext value={club}>
          {/* A new member chooses their duo pseudo before anything else: every game record is keyed by it. */}
          {club.me.duoPseudo === null ? <Welcome /> : <Outlet />}
        </ClubContext>
      </ClubLogoContext>
    </ClubNameContext>
  );
}
