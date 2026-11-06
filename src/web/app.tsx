import { useSyncExternalStore } from 'react';
import { isSignInRequired, subscribeToSignInRequired } from './api';
import { Brand } from './brand';
import { Connections } from './connections';
import { Dashboard } from './dashboard';
import { Direct } from './direct';
import { SignIn } from './sign-in';

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

function Page({ pathname }: { pathname: string }) {
  // "/direct/" and "/direct" are the same page.
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return <Dashboard />;
  if (path === '/direct') return <Direct />;
  if (path === '/connexions') return <Connections />;
  return <NotFound />;
}

export function App() {
  const signInRequired = useSyncExternalStore(subscribeToSignInRequired, isSignInRequired);
  if (signInRequired) return <SignIn />;
  return <Page pathname={location.pathname} />;
}
