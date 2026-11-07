import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { type Platform, platforms } from '../../lib/club';
import type { OwnProfile } from '../../lib/members';
import { platformLabels } from '../club';
import { fieldClass } from '../components/club/page';
import { Segmented } from '../components/club/segmented';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { saveProfile } from '../writes';

// Changing one's pseudos and platform, in a window over the profile.

const platformItems = platforms.map((value) => ({ value, label: platformLabels[value] }));
const networkError = (e: unknown) =>
  e instanceof TypeError ? 'Connexion Internet indisponible. Réessaie dans un instant.' : (e as Error).message;

export function ProfileEdit({
  me,
  open,
  onOpenChange,
}: {
  me: OwnProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
      location.reload();
    } catch (e) {
      setError(networkError(e));
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 rounded-[24px] bg-popover p-5 sm:max-w-md lg:p-7">
        <div className="flex flex-col gap-1">
          <DialogTitle className="font-display text-2xl">Mon jeu</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Ton pseudo duo, ton compte solo et ta plateforme.
          </DialogDescription>
        </div>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-duo" className="text-[13px] font-semibold text-soft">
              Pseudo duo
            </Label>
            <Input
              id="edit-duo"
              required
              minLength={2}
              maxLength={32}
              autoComplete="nickname"
              value={duoPseudo}
              disabled={busy || me.duoPseudoLocked}
              onChange={(event) => setDuoPseudo(event.target.value)}
              className={fieldClass}
            />
            <span className="text-xs leading-[1.4] text-muted-foreground">
              {me.duoPseudoLocked
                ? 'Figé : des matchs, exercices ou rangs y sont déjà rattachés.'
                : 'Ton nom dans les parties à deux. Il se change tant qu’aucun match n’y est rattaché.'}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-solo" className="text-[13px] font-semibold text-soft">
              Pseudo solo <span className="text-xs font-normal text-muted-foreground">(facultatif)</span>
            </Label>
            <Input
              id="edit-solo"
              maxLength={32}
              placeholder="Nom d’affichage Epic"
              value={soloPseudo}
              disabled={busy}
              onChange={(event) => setSoloPseudo(event.target.value)}
              className={fieldClass}
            />
            <span className="text-xs leading-[1.4] text-muted-foreground">
              Le nom d’affichage Epic de ton compte solo, même sur console si ce compte est lié à Epic : son rang 2v2
              s’affiche sous ton rang duo.
            </span>
          </div>
          <fieldset className="flex min-w-0 flex-col">
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
          <Button type="submit" variant="inverse" size="xl" disabled={busy} className="w-full">
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
