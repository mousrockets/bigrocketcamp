import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { type Platform, platforms } from '../../lib/club';
import { type ProfileInput, profile } from '../../lib/contract';
import { useBoardState } from '../board';
import { platformLabels, useClub } from '../club';
import { Button } from '../components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { clubQuery } from '../queries';
import { deleteAccount, saveProfile } from '../writes';
import { Confirm } from './confirm';
import { CheckIcon } from './icons';
import { RankAvatar, useMyRank } from './my-rank';
import { ErrorNote, FieldRow, Note, RowInput, SettingsCard, SettingsGroup, SettingsPage } from './parts';

/** Mon compte: the member's pseudos and platform, the address they sign in with, and the way out. */
export function AccountSettings() {
  const { me } = useClub();
  const { tier, summary } = useMyRank();
  const { refresh } = useBoardState();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const save = useMutation({
    mutationFn: saveProfile,
    onSuccess: async () => {
      // The roster and the cards are keyed by the duo pseudo: the club and its board are read again.
      await queryClient.invalidateQueries({ queryKey: clubQuery.queryKey });
      await refresh();
      await navigate({ to: '/reglages' });
    },
  });
  const form = useForm({
    defaultValues: {
      duoPseudo: me.duoPseudo ?? '',
      soloPseudo: me.soloPseudo ?? '',
      platform: me.platform ?? 'pc',
    } as ProfileInput,
    validators: { onSubmit: profile },
    // A refusal stays on the mutation, which the page shows.
    onSubmit: ({ value }) => save.mutateAsync(value).catch(() => {}),
  });

  return (
    <SettingsPage kicker="Toi" title="Mon compte">
      <div className="flex flex-col items-center gap-2.5 text-center">
        <RankAvatar tier={tier} large />
        <b className="font-semibold text-[22px] tracking-[-.01em]">{me.duoPseudo}</b>
        <span className="text-[13px] text-t3">{summary}</span>
      </div>
      <form
        noValidate
        className="contents"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <SettingsGroup
          label="Comptes Epic"
          note={
            <>
              {me.duoPseudoLocked && <Note>Ton pseudo duo est figé : des matchs y sont déjà rattachés.</Note>}
              <form.Subscribe
                selector={(state) => [state.fieldMeta.duoPseudo?.errors, state.fieldMeta.soloPseudo?.errors]}
              >
                {([duoErrors = [], soloErrors = []]) => <ErrorNote errors={[...duoErrors, ...soloErrors]} />}
              </form.Subscribe>
            </>
          }
        >
          <SettingsCard>
            <form.Field name="duoPseudo">
              {(field) => (
                <FieldRow id="duo" label="Pseudo duo" invalid={!field.state.meta.isValid}>
                  <RowInput
                    id="duo"
                    placeholder="Nom d’utilisateur Epic"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={!field.state.meta.isValid || undefined}
                    disabled={me.duoPseudoLocked || save.isPending}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </FieldRow>
              )}
            </form.Field>
            <form.Field name="soloPseudo">
              {(field) => (
                <FieldRow id="solo" label="Pseudo solo" invalid={!field.state.meta.isValid}>
                  <RowInput
                    id="solo"
                    placeholder="Nom d’utilisateur Epic"
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={!field.state.meta.isValid || undefined}
                    disabled={save.isPending}
                    value={field.state.value ?? ''}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </FieldRow>
              )}
            </form.Field>
          </SettingsCard>
        </SettingsGroup>
        <form.Field name="platform">
          {(field) => (
            <SettingsGroup label="Plateforme" note={<ErrorNote errors={field.state.meta.errors} />}>
              <SettingsCard>
                <ToggleGroup
                  aria-label="Plateforme"
                  orientation="vertical"
                  spacing={0}
                  disabled={save.isPending}
                  value={[field.state.value]}
                  onValueChange={(value: string[]) => {
                    const [picked] = value;
                    if (picked) field.handleChange(picked as Platform);
                  }}
                  className="w-full gap-0 rounded-none"
                >
                  {platforms.map((value) => (
                    <ToggleGroupItem
                      key={value}
                      value={value}
                      className="group/platform relative h-auto min-h-[52px] w-full justify-between gap-3 rounded-none! px-4! font-normal text-[16px] text-t1 [line-height:normal] hover:bg-white/4 hover:text-t1 aria-pressed:bg-transparent not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:left-[58px] not-first:before:h-[.5px] not-first:before:bg-line not-first:before:content-['']"
                    >
                      {platformLabels[value]}
                      <span className="flex opacity-0 group-aria-pressed/platform:opacity-100">
                        <CheckIcon />
                      </span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </SettingsCard>
            </SettingsGroup>
          )}
        </form.Field>
        <SettingsGroup label="Connexion">
          <SettingsCard>
            <FieldRow label="E-mail">
              <span className="min-w-0 flex-1 truncate text-right text-t3">{me.email}</span>
            </FieldRow>
          </SettingsCard>
        </SettingsGroup>
        {save.error && <ErrorNote errors={[save.error]} />}
        <Button type="submit" variant="cta" size="cta" disabled={save.isPending}>
          {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </form>
      <DeleteAccount />
    </SettingsPage>
  );
}

function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const erase = useMutation({
    mutationFn: deleteAccount,
    // The session is gone with the account: the sign-in screen follows.
    onSuccess: () => location.assign('/'),
  });
  return (
    <>
      <Button
        variant="ghost"
        className="-mt-3 min-h-11 self-center px-1.5 font-medium text-[15px] text-destructive hover:bg-transparent hover:text-destructive dark:hover:bg-transparent"
        onClick={() => setOpen(true)}
      >
        Supprimer mon compte…
      </Button>
      <Confirm
        open={open}
        onOpenChange={setOpen}
        title="Supprimer ton compte ?"
        action="Supprimer mon compte"
        pending={erase.isPending || erase.isSuccess}
        error={erase.error}
        onConfirm={() => erase.mutate()}
      >
        Ton adresse e-mail, ton profil, tes connexions et tes collecteurs sont effacés, et tu ne peux plus te connecter.
        Tes matchs, exercices et rangs restent dans l’historique du club, sous ton pseudo duo.
      </Confirm>
    </>
  );
}
