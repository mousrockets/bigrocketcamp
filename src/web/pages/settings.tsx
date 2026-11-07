import { useMutation, useQuery } from '@tanstack/react-query';
import { cn } from 'cn';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { parisDay } from '../../lib/domain';
import { defaultLastPlaceRules, lastPlaceRuleOn } from '../../lib/match-rules';
import { useClub } from '../club';
import { ClubLogo } from '../components/club/club-logo';
import { ListLink } from '../components/club/list';
import { BackLink, fieldClass, PageHeader, Panel } from '../components/club/page';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { resizeLogo } from '../logo-image';
import { membersQuery } from '../queries';
import { removeClubLogo, sendJson, uploadClubLogo } from '../writes';

// The club's identity and rules, for its administrators.

const dayLabel = (day: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' }).format(
    new Date(`${day}T12:00:00Z`),
  );
const networkError = (e: unknown) =>
  e instanceof TypeError ? 'Connexion Internet indisponible. Réessaie dans un instant.' : (e as Error).message;

export function AdminOnly() {
  return (
    <>
      <PageHeader
        back={<BackLink to="/profil" label="Retour au profil" wide="Profil" />}
        kicker="Administration"
        title="Réglages du club"
      />
      <p className="px-1 text-sm text-muted-foreground">Cette page est réservée aux administrateurs du club.</p>
    </>
  );
}

export function SettingsPage() {
  const club = useClub();
  const isAdmin = club.me.role === 'admin';
  const { data: members } = useQuery({ ...membersQuery, enabled: isAdmin });
  const [name, setName] = useState(club.name);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const send = useMutation({ mutationFn: sendJson }).mutateAsync;
  const uploadLogoImage = useMutation({ mutationFn: uploadClubLogo }).mutateAsync;
  const resetLogo = useMutation({ mutationFn: removeClubLogo }).mutateAsync;
  const today = parisDay();
  const rules = club.rules?.lastPlace ?? defaultLastPlaceRules;
  const ruleToday = lastPlaceRuleOn(rules, today);
  const comingRule = rules.find((rule) => rule.effectiveFrom > today);
  const savedChoice = (comingRule ?? ruleToday).enabled ? 'on' : 'off';
  const [choice, setChoice] = useState(savedChoice);

  async function act(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await task();
      // The name, the logo and the rules show everywhere: a fresh load updates them all.
      location.reload();
    } catch (e) {
      toast.error(networkError(e));
      setBusy(false);
    }
  }

  const save = () =>
    act(async () => {
      if (name.trim() !== club.name) {
        await send({ path: '/api/club', method: 'PUT', body: { name }, fallback: 'Nom du club invalide.' });
      }
      if (choice !== savedChoice) {
        await send({
          path: '/api/club/rules',
          method: 'PUT',
          body: { lastPlace: { enabled: choice === 'on' } },
          fallback: 'Règle invalide.',
        });
      }
    });

  if (!isAdmin) return <AdminOnly />;
  const changed = name.trim() !== club.name || choice !== savedChoice;
  return (
    <div className="flex flex-col gap-3.5 lg:max-w-[720px]">
      <PageHeader
        back={<BackLink to="/profil" label="Retour au profil" wide="Profil" />}
        kicker="Administration"
        title="Réglages du club"
      />
      <Panel aria-label="Identité du club" className="gap-4 p-4">
        <div className="flex items-center gap-3.5">
          <ClubLogo size={64} wide={72} label="Logo actuel" />
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-soft">Logo du club</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
                className="h-10 rounded-xl px-3.5 text-sm font-semibold"
              >
                Changer
              </Button>
              {club.logo && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => act(() => resetLogo())}
                  className="h-10 rounded-xl px-3.5 text-sm font-semibold text-destructive"
                >
                  Retirer
                </Button>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              aria-label="Choisir le logo du club"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) act(async () => uploadLogoImage(await resizeLogo(file)));
              }}
            />
          </div>
        </div>
        <p className="-mt-2 text-xs leading-[1.4] text-muted-foreground">
          L’image est recadrée en carré et allégée sur ton appareil avant l’envoi (quelques dizaines de Ko).
        </p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="club-name" className="text-[13px] font-semibold text-soft">
            Nom du club
          </Label>
          <Input
            id="club-name"
            required
            minLength={2}
            maxLength={60}
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            className={fieldClass}
          />
          <span className="text-xs leading-[1.4] text-muted-foreground">
            Affiché en haut de chaque écran et sur la connexion.
          </span>
        </div>
      </Panel>
      <Panel aria-label="Règles des défis" className="gap-3 p-4">
        <h2 className="font-display text-xl">Règles des défis</h2>
        <p className="text-sm text-soft">
          Une défaite vaut toujours <b className="text-cost">5 pompes</b>.
        </p>
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 text-[13px] font-semibold text-soft">
            +5 pour le joueur du club le moins bien classé de son équipe
          </legend>
          <RadioGroup
            value={choice}
            onValueChange={(value) => setChoice(value as string)}
            disabled={busy}
            className="gap-2"
          >
            {(
              [
                ['on', 'Oui : +5 pour celui du club qui a le moins de points'],
                ['off', 'Non : 5 pompes par défaite pour tout le monde'],
              ] as const
            ).map(([value, label]) => (
              <Label
                key={value}
                htmlFor={`rule-${value}`}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-[14px] border border-input p-3.5 text-sm leading-[1.35] font-normal',
                  choice === value && 'border-primary/60 bg-primary/8',
                )}
              >
                <RadioGroupItem id={`rule-${value}`} value={value} className="mt-0.5" />
                {label}
              </Label>
            ))}
          </RadioGroup>
        </fieldset>
        <p className="text-xs leading-[1.4] text-muted-foreground">
          Aujourd’hui : {ruleToday.enabled ? '+5 activé' : '+5 désactivé'}
          {ruleToday.enabled && ruleToday.ties === 'none' && ', sauf égalité'}.
          {comingRule &&
            ` À partir du ${dayLabel(comingRule.effectiveFrom)} : ${comingRule.enabled ? '+5 activé' : '+5 désactivé'}.`}{' '}
          Un changement s’applique à partir de demain : les matchs déjà joués, ceux d’aujourd’hui compris, gardent leurs
          pompes.
        </p>
      </Panel>
      <Button
        variant="inverse"
        size="xl"
        disabled={busy || !changed || name.trim().length < 2}
        onClick={save}
        className="w-full"
      >
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
      <Panel>
        <ListLink
          to="/reglages/membres"
          label={<b className="font-semibold">Membres et invitations</b>}
          value={members ? `${members.length} membre${members.length > 1 ? 's' : ''}` : undefined}
          className="min-h-14"
        />
      </Panel>
    </div>
  );
}
