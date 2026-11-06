import { useEffect, useState, useSyncExternalStore } from 'react';
import { isSignInRequired, subscribeToSignInRequired } from './api';
import { Brand } from './brand';
import { type Club, ClubContext, ClubNameContext, fetchClub, fetchClubName } from './club';
import { Connections } from './connections';
import { Dashboard } from './dashboard';
import { Direct } from './direct';
import { Profile } from './profile';
import { Settings } from './settings';
import { SignIn } from './sign-in';

export const profilePath = '/profil';

function NotFound() {
  return (
    <main>
      <header>
        <Brand />
        <a className="back-link" href="/">
          ← Retour au tableau
        </a>
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

function Page({ path }: { path: string }) {
  if (path === '/') return <Dashboard />;
  if (path === '/direct') return <Direct />;
  if (path === '/connexions') return <Connections />;
  if (path === profilePath) return <Profile />;
  if (path === '/reglages') return <Settings />;
  return <NotFound />;
}

export function App() {
  const signInRequired = useSyncExternalStore(subscribeToSignInRequired, isSignInRequired);
  const [club, setClub] = useState<Club | null>(null);
  const [name, setName] = useState('');
  const [failed, setFailed] = useState(false);
  // "/direct/" and "/direct" are the same page.
  const path = location.pathname.replace(/\/+$/, '') || '/';

  useEffect(() => {
    let loading = false;
    function load() {
      if (loading || document.hidden) return;
      loading = true;
      fetchClub()
        .then((loaded) => {
          setFailed(!loaded && !isSignInRequired());
          if (loaded) setClub(loaded);
          if (loaded || isSignInRequired()) stopRetrying();
        })
        .catch(() => setFailed(true))
        .finally(() => {
          loading = false;
        });
    }
    // An installed app opened offline has no reload button: it tries again once the network or the member is back.
    function stopRetrying() {
      removeEventListener('online', load);
      document.removeEventListener('visibilitychange', load);
    }
    load();
    addEventListener('online', load);
    document.addEventListener('visibilitychange', load);
    return stopRetrying;
  }, []);

  useEffect(() => {
    if (signInRequired) fetchClubName().then(setName);
  }, [signInRequired]);

  const clubName = club?.name ?? name;
  useEffect(() => {
    if (!clubName) return;
    document.title = `${clubName} · Le club`;
    // The name under the icon on an iPhone home screen (Android reads the manifest).
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', clubName);
  }, [clubName]);

  // A new member chooses their duo pseudo before anything else: every game record is keyed by it.
  const mustFillProfile = club !== null && club.me.duoPseudo === null && path !== profilePath;
  useEffect(() => {
    if (mustFillProfile) location.replace(profilePath);
  }, [mustFillProfile]);

  if (signInRequired) {
    return (
      <ClubNameContext value={name}>
        <SignIn />
      </ClubNameContext>
    );
  }
  if (failed) return <Unavailable />;
  if (!club || mustFillProfile) return null;
  return (
    <ClubNameContext value={club.name}>
      <ClubContext value={club}>
        <Page path={path} />
      </ClubContext>
    </ClubNameContext>
  );
}
