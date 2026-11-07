import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useRef } from 'react';
import { clubName, ruleSwitch } from '../../lib/contract';
import { parisDay } from '../../lib/days';
import { defaultLastPlaceRules, lastPlaceRuleOn } from '../../lib/domain';
import { networkError } from '../access/gate';
import { useBoardState } from '../board';
import { useClub } from '../club';
import { ClubLogo } from '../components/club-logo';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { resizeLogo } from '../logo-image';
import { clubQuery } from '../queries';
import { removeClubLogo, sendJson, uploadClubLogo } from '../writes';
import { RuleIcon } from './icons';
import {
  AdminsOnly,
  ErrorNote,
  FieldRow,
  RowIcon,
  RowInput,
  RowLabel,
  SettingsCard,
  SettingsGroup,
  SettingsPage,
  SettingsRow,
} from './parts';

// The club as its admins set it: its logo, its name, its challenge rules.

const clubSettings = clubName.extend({ lastPlace: ruleSwitch.shape.enabled });

/** The +5 as it stands from tomorrow on: a change never touches the matches already played. */
function nextLastPlaceRule(rules = defaultLastPlaceRules) {
  const today = parisDay();
  return rules.find((rule) => rule.effectiveFrom > today) ?? lastPlaceRuleOn(rules, today);
}

export function ClubSettings() {
  const { me } = useClub();
  if (me.role !== 'admin') return <AdminsOnly title="Club" />;
  return <ClubForm />;
}

function ClubForm() {
  const club = useClub();
  const { refresh } = useBoardState();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const lastPlace = nextLastPlaceRule(club.rules?.lastPlace).enabled;
  // The name shows in every header and the rules count every match: the club and its board are read again.
  const reread = async () => {
    await queryClient.invalidateQueries({ queryKey: clubQuery.queryKey });
    await refresh();
  };
  const save = useMutation({
    mutationFn: async (value: { name: string; lastPlace: boolean }) => {
      if (value.name.trim() !== club.name) {
        await sendJson({
          path: '/api/club',
          method: 'PUT',
          body: { name: value.name },
          fallback: 'Nom du club invalide.',
        });
      }
      if (value.lastPlace !== lastPlace) {
        await sendJson({
          path: '/api/club/rules',
          method: 'PUT',
          body: { lastPlace: { enabled: value.lastPlace } },
          fallback: 'Règle invalide.',
        });
      }
    },
    onSuccess: async () => {
      await reread();
      await navigate({ to: '/reglages' });
    },
  });
  const form = useForm({
    defaultValues: { name: club.name, lastPlace },
    validators: { onSubmit: clubSettings },
    onSubmit: ({ value }) => save.mutateAsync(value).catch(() => {}),
  });

  return (
    <SettingsPage kicker="Réservé aux admins" title="Club">
      <LogoCard reread={reread} />
      <form
        noValidate
        className="contents"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="name">
          {(field) => (
            <SettingsGroup note={<ErrorNote errors={field.state.meta.errors} />}>
              <SettingsCard>
                <FieldRow id="club-name" label="Nom du club" invalid={!field.state.meta.isValid}>
                  <RowInput
                    id="club-name"
                    maxLength={60}
                    aria-invalid={!field.state.meta.isValid || undefined}
                    disabled={save.isPending}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </FieldRow>
              </SettingsCard>
            </SettingsGroup>
          )}
        </form.Field>
        <SettingsGroup label="Règles">
          <SettingsCard>
            <form.Field name="lastPlace">
              {(field) => (
                <SettingsRow>
                  <RowIcon>
                    <RuleIcon />
                  </RowIcon>
                  <RowLabel>+5 pour le moins de points</RowLabel>
                  <Switch
                    size="ios"
                    aria-label="+5 pour le moins de points"
                    checked={field.state.value}
                    disabled={save.isPending}
                    onCheckedChange={(checked) => field.handleChange(checked)}
                  />
                </SettingsRow>
              )}
            </form.Field>
          </SettingsCard>
        </SettingsGroup>
        {save.error && <ErrorNote errors={[networkError(save.error)]} />}
        <Button type="submit" variant="cta" size="cta" disabled={save.isPending}>
          {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </form>
    </SettingsPage>
  );
}

/** The logo, changed as soon as a picture is chosen: it is cropped and lightened on the device first. */
function LogoCard({ reread }: { reread: () => Promise<void> }) {
  const { logo } = useClub();
  const picker = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (file: File) => uploadClubLogo(await resizeLogo(file)),
    onSuccess: reread,
  });
  const reset = useMutation({ mutationFn: removeClubLogo, onSuccess: reread });
  const busy = upload.isPending || reset.isPending;
  const error = upload.error ?? reset.error;

  return (
    <SettingsGroup note={error && <ErrorNote errors={[networkError(error)]} />}>
      <SettingsCard className="items-center gap-4 px-4 py-6">
        <ClubLogo className="size-24 rounded-[24px] bg-t1 font-extrabold text-[34px] text-black shadow-[0_20px_50px_-18px_rgba(255,255,255,.35)]" />
        <span className="flex gap-2">
          <Button variant="pill" size="pill" disabled={busy} onClick={() => picker.current?.click()}>
            Changer le logo
          </Button>
          {logo && (
            <Button variant="pill-danger" size="pill" disabled={busy} onClick={() => reset.mutate()}>
              Retirer
            </Button>
          )}
        </span>
        <Input
          ref={picker}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          aria-label="Logo du club"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) upload.mutate(file);
          }}
        />
      </SettingsCard>
    </SettingsGroup>
  );
}
