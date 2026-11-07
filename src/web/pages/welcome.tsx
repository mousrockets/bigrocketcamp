import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { type Platform, platforms } from '../../lib/club';
import { platformLabels, useClub } from '../club';
import { ClubLogo } from '../components/club/club-logo';
import { fieldClass, hintClass, labelClass } from '../components/club/page';
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

  // On a phone the design places the form at 330 px and the button 40 px from the bottom of an 844 px screen whose
  // first 44 px are the status bar: here they start from the safe area. A wide screen centres a card beside the title.
  return (
    <main className="relative flex min-h-dvh flex-col overflow-x-clip bg-background px-6 pt-[calc(env(safe-area-inset-top)+28px)] pb-[max(env(safe-area-inset-bottom),40px)] text-foreground lg:items-center lg:justify-center lg:px-5 lg:py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)-44px)] h-[380px] bg-[radial-gradient(120%_70%_at_50%_-10%,rgb(40_90_170/0.26),transparent_70%)] lg:inset-0 lg:h-auto lg:bg-[radial-gradient(70%_60%_at_20%_0%,rgb(40_90_170/0.3),transparent_70%)]"
      />
      <form
        className="relative flex w-full flex-1 flex-col lg:max-w-[880px] lg:flex-none lg:flex-row lg:flex-wrap lg:items-start lg:gap-10"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex min-h-[258px] flex-col gap-3 lg:min-h-0 lg:flex-[1_1_320px] lg:gap-3.5">
          <ClubLogo size={52} wide={64} />
          <span className="kicker">Première connexion</span>
          <h1 className="font-display text-[38px] leading-none lg:text-[clamp(36px,4vw,56px)] lg:leading-[0.98]">
            Bienvenue dans l’équipe !
          </h1>
          <p className="text-[15px] leading-[1.45] text-soft lg:text-base lg:leading-[1.5]">
            Choisis ton pseudo duo : tes matchs, tes pompes et tes exploits y seront gravés. Pour toujours.
          </p>
        </div>
        {/* The design's card grows from 360 px plus its padding and edge (content-box), so 418 px in all. */}
        <div className="flex flex-1 flex-col gap-5 lg:flex-[1_1_418px] lg:rounded-3xl lg:border lg:border-border lg:bg-card lg:p-7">
          <div className={labelClass}>
            <Label htmlFor="duo-pseudo" className="text-[13px] leading-[normal] font-semibold text-soft">
              Pseudo duo
            </Label>
            <Input
              id="duo-pseudo"
              required
              minLength={2}
              maxLength={32}
              autoComplete="nickname"
              aria-describedby="duo-pseudo-hint"
              value={duoPseudo}
              disabled={busy}
              onChange={(event) => setDuoPseudo(event.target.value)}
              className={fieldClass}
            />
            <span id="duo-pseudo-hint" className={hintClass}>
              Ton nom dans les parties à deux. Modifiable tant qu’aucun match n’y est rattaché.
            </span>
          </div>
          {/* The design's label is a column: "(facultatif)" sits on its own line, under "Pseudo solo". */}
          <div className={labelClass}>
            <Label
              htmlFor="solo-pseudo"
              className="flex-col items-start gap-2 text-[13px] leading-[normal] font-semibold text-soft"
            >
              Pseudo solo <span className={hintClass}>(facultatif)</span>
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
          </div>
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-2 text-[13px] font-semibold text-soft">Plateforme</legend>
            <Segmented
              label="Plateforme"
              items={platformItems}
              value={(platform ?? '') as Platform}
              disabled={busy}
              onChange={setPlatform}
              className="[&_button]:h-10 [&_button]:px-1 [&_button]:text-[13px] lg:grid-cols-[repeat(auto-fit,minmax(90px,1fr))] lg:grid-flow-row lg:[&_button]:text-sm"
            />
          </fieldset>
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" variant="inverse" size="2xl" disabled={busy} className="mt-auto w-full lg:mt-0">
            {busy ? 'Enregistrement…' : 'Let’s go'}
          </Button>
        </div>
      </form>
    </main>
  );
}
