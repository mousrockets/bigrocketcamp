import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { parisDay } from '../../lib/domain';
import { defaultLastPlaceRules, lastPlaceRuleOn } from '../../lib/match-rules';
import { useClub } from '../club';
import { ClubLogo } from '../components/club/club-logo';
import { BackLink, fieldVariants, hintClass, labelClass, PageHeader, Panel } from '../components/club/page';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { resizeLogo } from '../logo-image';
import { membersQuery } from '../queries';
import { removeClubLogo, sendJson, uploadClubLogo } from '../writes';
import { ClubMembers } from './members';

// The club's identity and rules, for its administrators. A wide screen shows the members beside them; a phone
// opens them on their own page.

const dayLabel = (day: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' }).format(
    new Date(`${day}T12:00:00Z`),
  );
const networkError = (e: unknown) =>
  e instanceof TypeError ? 'Connexion Internet indisponible. Réessaie dans un instant.' : (e as Error).message;

/** The design's .sm beside the logo: 40 px on a phone, 38 px and 13 px text on a wide screen. */
const logoButton = 'h-10 rounded-xl px-3.5 text-sm font-semibold lg:h-[38px] lg:text-[13px]';

/** The design's native radio: a 20 px white disc, then a blue ring around a blue dot once chosen. */
const radioClass =
  'mt-0 size-5 border-[#767676] bg-white dark:bg-white data-checked:border-primary data-checked:bg-white dark:data-checked:bg-white [&_[data-slot=radio-group-indicator]_span]:size-3 [&_[data-slot=radio-group-indicator]_span]:bg-primary';

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
  const saveButton = (className: string) => (
    <Button
      variant="inverse"
      size="cta"
      disabled={busy || !changed || name.trim().length < 2}
      onClick={save}
      className={className}
    >
      {busy ? 'Enregistrement…' : 'Enregistrer'}
    </Button>
  );
  const options = [
    ['on', 'Oui : le moins bon du club en prend 5 de plus. Pas de pitié.', ''],
    ['off', 'Non : 5 pompes par défaite, pour tout le monde.', ' Le communisme des pompes.'],
  ] as const;

  return (
    <>
      <PageHeader
        back={<BackLink to="/profil" label="Retour au profil" wide="Profil" />}
        kicker="Administration"
        title="Réglages du club"
        actions={saveButton('hidden h-12 rounded-[14px] px-[26px] text-base lg:inline-flex')}
      />
      <div className="flex flex-col gap-3.5 lg:flex-row lg:flex-wrap lg:items-start lg:gap-5">
        <div className="contents lg:flex lg:min-w-0 lg:flex-[1_1_400px] lg:flex-col lg:gap-5">
          <Panel aria-label="Identité du club" className="gap-4 p-4 lg:gap-[18px] lg:p-[22px]">
            <div className="flex items-center gap-3.5 lg:gap-4">
              <ClubLogo size={64} wide={72} label="Logo actuel" />
              <div className="flex flex-col gap-2">
                <span className="text-[13px] font-semibold text-soft">Logo du club</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => fileInput.current?.click()}
                    className={logoButton}
                  >
                    Changer
                  </Button>
                  {club.logo && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => act(() => resetLogo())}
                      className={cn(logoButton, 'text-destructive hover:text-destructive')}
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
            <label htmlFor="club-name" className={labelClass}>
              Nom du club
              <Input
                id="club-name"
                required
                minLength={2}
                maxLength={60}
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
                className={cn(fieldVariants({ size: 'md' }), 'lg:h-12 lg:rounded-[12px] lg:text-[15px]')}
              />
              <span className={hintClass}>Affiché en haut de chaque écran et sur la connexion.</span>
            </label>
          </Panel>

          <Panel aria-label="Règles des défis" className="gap-3 p-4 lg:p-[22px]">
            <h2 className="font-display text-xl lg:text-[22px]">Les règles du vestiaire</h2>
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
                {options.map(([value, label, more]) => (
                  <Label
                    key={value}
                    htmlFor={`rule-${value}`}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-[14px] border border-white/10 p-3.5 text-sm leading-[1.35] font-normal',
                      choice === value && 'border-primary/60 bg-primary/8',
                    )}
                  >
                    <RadioGroupItem id={`rule-${value}`} value={value} className={radioClass} />
                    <span>
                      {label}
                      {more && <span className="lg:hidden">{more}</span>}
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </fieldset>
            <p className={hintClass}>
              {comingRule &&
                `Aujourd’hui : +5 ${ruleToday.enabled ? 'activé' : 'désactivé'}${ruleToday.enabled && ruleToday.ties === 'none' ? ', sauf égalité' : ''}. À partir du ${dayLabel(comingRule.effectiveFrom)} : +5 ${comingRule.enabled ? 'activé' : 'désactivé'}. `}
              La règle s’applique aux matchs à partir de demain.
              <span className="lg:hidden"> Les matchs déjà joués gardent la règle de leur jour.</span>
            </p>
          </Panel>

          {saveButton('h-[50px] w-full rounded-[14px] text-base lg:hidden')}

          <Link
            to="/reglages/membres"
            className="flex min-h-11 items-center justify-between rounded-card border border-border bg-card p-4 text-[15px] font-semibold text-foreground no-underline hover:text-foreground lg:hidden"
          >
            Membres et invitations
            <span className="font-medium text-muted-foreground">
              {members ? `${members.length} membre${members.length > 1 ? 's' : ''} ›` : '›'}
            </span>
          </Link>
        </div>

        <div className="hidden min-w-0 flex-[1_1_400px] flex-col gap-5 lg:flex">
          <ClubMembers />
        </div>
      </div>
    </>
  );
}
