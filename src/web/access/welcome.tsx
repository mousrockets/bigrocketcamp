import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { type Platform, platforms } from '../../lib/club';
import { type ProfileInput, profile } from '../../lib/contract';
import { platformLabels, useClub } from '../club';
import { ClubLogo } from '../components/club-logo';
import { Button } from '../components/ui/button';
import { FieldGroup, FieldLegend, FieldSet } from '../components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { saveProfile } from '../writes';
import {
  GateField,
  GateFieldError,
  GateFormField,
  GateHint,
  GateLabel,
  GateLead,
  GateMessage,
  GatePage,
  GateTitle,
  Kicker,
  networkError,
} from './gate';

/** A new member's first screen: the duo pseudo keys every game record, so it comes before anything else. */
export function Welcome() {
  const { me } = useClub();
  const save = useMutation({
    mutationFn: saveProfile,
    // The roster and the cards depend on the profile: a fresh load shows them as saved.
    onSuccess: () => location.assign('/'),
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
  const busy = save.isPending || save.isSuccess;

  return (
    <GatePage
      glow="radial-gradient(120% 70% at 50% -10%,rgba(40,90,170,.26),rgba(6,6,7,0) 70%)"
      topTint="#0a101b"
      glowHeight={380}
      className="lg:items-center lg:py-12"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 hidden bg-[radial-gradient(70%_60%_at_20%_0%,rgba(40,90,170,.3),rgba(6,6,7,0)_70%)] lg:block"
      />
      <form
        noValidate
        className="relative mx-auto flex w-full max-w-[400px] flex-col pt-[72px] lg:max-w-[880px] lg:flex-row lg:flex-wrap lg:items-start lg:gap-10 lg:pt-0"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <div className="flex min-h-[258px] flex-col gap-3 lg:min-h-0 lg:flex-[1_1_320px] lg:gap-3.5">
          <ClubLogo className="size-[52px] rounded-[15px] text-[20px] lg:size-16 lg:rounded-[18px] lg:text-[24px]" />
          <Kicker>PREMIÈRE CONNEXION</Kicker>
          <GateTitle className="text-[38px] lg:text-[clamp(36px,4vw,56px)] lg:[line-height:.98]">
            Bienvenue dans l’équipe !
          </GateTitle>
          <GateLead className="lg:text-[16px]">
            Dis-nous qui tu es sur le terrain. On s’occupe de compter tes défaites… et tes pompes.
          </GateLead>
        </div>
        <FieldGroup className="gap-5 lg:flex-[1_1_418px] lg:rounded-3xl lg:border lg:border-white/6 lg:bg-[#111114] lg:p-7">
          <form.Field name="duoPseudo">
            {(field) => (
              <GateFormField data-invalid={!field.state.meta.isValid || undefined}>
                <GateLabel htmlFor="duo">Pseudo de ton compte duo</GateLabel>
                <GateField
                  id="duo"
                  autoComplete="nickname"
                  placeholder="Nom d’utilisateur Epic"
                  autoFocus
                  aria-invalid={!field.state.meta.isValid || undefined}
                  value={field.state.value}
                  disabled={busy}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  className="h-[52px]"
                />
                <GateHint>C’est le compte pour jouer avec tes amis.</GateHint>
                <GateFieldError errors={field.state.meta.errors} />
              </GateFormField>
            )}
          </form.Field>
          <form.Field name="soloPseudo">
            {(field) => (
              <GateFormField data-invalid={!field.state.meta.isValid || undefined}>
                <GateLabel htmlFor="solo">Pseudo de ton compte solo</GateLabel>
                <GateHint>(facultatif)</GateHint>
                <GateField
                  id="solo"
                  placeholder="Nom d’utilisateur Epic"
                  aria-invalid={!field.state.meta.isValid || undefined}
                  value={field.state.value ?? ''}
                  disabled={busy}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  className="h-[52px]"
                />
                <GateFieldError errors={field.state.meta.errors} />
              </GateFormField>
            )}
          </form.Field>
          <form.Field name="platform">
            {(field) => (
              <FieldSet className="gap-2">
                <FieldLegend
                  variant="label"
                  className="mb-2 font-semibold text-[13px] text-gate-soft [line-height:normal] data-[variant=label]:text-[13px]"
                >
                  Plateforme
                </FieldLegend>
                <ToggleGroup
                  aria-label="Plateforme"
                  value={[field.state.value]}
                  onValueChange={(value: string[]) => {
                    const [picked] = value;
                    if (picked) field.handleChange(picked as Platform);
                  }}
                  disabled={busy}
                  spacing={1}
                  className="grid w-full grid-cols-4 gap-1 rounded-[14px] bg-gate-field p-1 lg:grid-cols-[repeat(auto-fit,minmax(90px,1fr))]"
                >
                  {platforms.map((value) => (
                    <ToggleGroupItem
                      key={value}
                      value={value}
                      className="h-10 rounded-[10px] font-semibold text-[13px] text-gate-soft hover:bg-white/5 hover:text-gate-text aria-pressed:bg-gate-text aria-pressed:text-gate lg:text-[14px]"
                    >
                      {platformLabels[value]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <GateFieldError errors={field.state.meta.errors} />
              </FieldSet>
            )}
          </form.Field>
          {save.error && <GateMessage tone="error">{networkError(save.error)}</GateMessage>}
          <Button type="submit" variant="gate" size="gate" disabled={busy} className="-mt-3 w-full lg:mt-0">
            {save.isPending ? 'Enregistrement…' : 'Let’s go'}
          </Button>
        </FieldGroup>
      </form>
    </GatePage>
  );
}
