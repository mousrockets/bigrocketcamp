import { useMutation } from '@tanstack/react-query';
import { cn } from 'cn';
import { useState } from 'react';
import { type Platform, platforms } from '../../lib/club';
import { platformLabels, useClub } from '../club';
import { ClubLogo } from '../components/club/club-logo';
import { fieldClass } from '../components/club/page';
import { Segmented } from '../components/club/segmented';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { saveProfile } from '../writes';

// A new member's first screen: the duo pseudo every game record is keyed by, before anything else.

const platformItems = platforms.map((value) => ({ value, label: platformLabels[value] }));

const networkError = (e: unknown) =>
  e instanceof TypeError ? 'Connexion Internet indisponible. Réessaie dans un instant.' : (e as Error).message;

export function WelcomePage() {
  const { me } = useClub();
  const [duoPseudo, setDuoPseudo] = useState(me.duoPseudo ?? '');
  const [soloPseudo, setSoloPseudo] = useState(me.soloPseudo ?? '');
  const [platform, setPlatform] = useState<Platform | null>(me.platform);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = useMutation({ mutationFn: saveProfile }).mutateAsync;

  async function submit() {
    if (busy) return;
    if (!platform) {
      setError('Choisis ta plateforme.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await save({ duoPseudo, soloPseudo, platform });
      // The roster and the board depend on the profile: a fresh load shows them as saved.
      location.assign('/');
    } catch (e) {
      setError(networkError(e));
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh items-start justify-center overflow-x-clip bg-background px-6 pt-[calc(env(safe-area-inset-top)+56px)] pb-[max(env(safe-area-inset-bottom),40px)] text-foreground lg:items-center lg:px-5 lg:py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_45%_at_50%_-10%,var(--glow),transparent_70%)] lg:bg-[radial-gradient(70%_60%_at_20%_0%,var(--glow),transparent_70%)]"
      />
      <form
        className="relative flex w-full max-w-[880px] flex-col gap-10 lg:flex-row lg:flex-wrap lg:items-start"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-col gap-3 lg:flex-[1_1_320px] lg:gap-3.5">
          <ClubLogo size={52} wide={64} />
          <span className="kicker">Première connexion</span>
          <h1 className="font-display text-[38px] leading-none lg:text-[clamp(36px,4vw,56px)] lg:leading-[0.98]">
            Bienvenue au club
          </h1>
          <p className="text-[15px] leading-[1.45] text-soft lg:text-base lg:leading-normal">
            Avant tout, choisis ton pseudo duo : tes matchs, tes exercices et ton rang y seront rattachés.
          </p>
        </div>
        <div className="flex flex-col gap-5 lg:flex-[1_1_360px] lg:rounded-3xl lg:border lg:border-border lg:bg-card lg:p-7">
          <div className="flex flex-col gap-2">
            <Label htmlFor="duo-pseudo" className="text-[13px] font-semibold text-soft">
              Pseudo duo
            </Label>
            <Input
              id="duo-pseudo"
              required
              minLength={2}
              maxLength={32}
              autoComplete="nickname"
              value={duoPseudo}
              disabled={busy}
              onChange={(event) => setDuoPseudo(event.target.value)}
              className={fieldClass}
            />
            <span className="text-xs leading-[1.4] text-muted-foreground">
              Ton nom dans les parties à deux. Modifiable tant qu’aucun match n’y est rattaché.
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="solo-pseudo" className="text-[13px] font-semibold text-soft">
              Pseudo solo <span className="text-xs font-normal text-muted-foreground">(facultatif)</span>
            </Label>
            <Input
              id="solo-pseudo"
              maxLength={32}
              placeholder="Nom d’affichage Epic"
              value={soloPseudo}
              disabled={busy}
              onChange={(event) => setSoloPseudo(event.target.value)}
              className={fieldClass}
            />
            <span className="text-xs leading-[1.4] text-muted-foreground">
              Le nom d’affichage Epic de ton compte solo, même sur console si ce compte est lié à Epic.
            </span>
          </div>
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-2 text-[13px] font-semibold text-soft">Plateforme</legend>
            <Segmented
              label="Plateforme"
              items={platformItems}
              value={(platform ?? '') as Platform}
              disabled={busy}
              onChange={setPlatform}
              className="[&_button]:h-10 [&_button]:px-1 [&_button]:text-[13px]"
            />
          </fieldset>
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            type="submit"
            variant="inverse"
            size="xl"
            disabled={busy}
            className={cn('mt-auto h-[54px] w-full max-lg:mt-6')}
          >
            {busy ? 'Enregistrement…' : 'Entrer dans le club'}
          </Button>
        </div>
      </form>
    </main>
  );
}
