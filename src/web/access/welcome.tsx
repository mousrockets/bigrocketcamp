import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { type Platform, platforms } from '../../lib/club';
import { platformLabels, useClub } from '../club';
import { ClubLogo } from '../components/club-logo';
import { Button } from '../components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { saveProfile } from '../writes';
import { GateField, GateLabel, GateLead, GateMessage, GatePage, GateTitle, Kicker, networkError } from './gate';

/** A new member's first screen: the duo pseudo keys every game record, so it comes before anything else. */
export function Welcome() {
  const { me } = useClub();
  const [duoPseudo, setDuoPseudo] = useState(me.duoPseudo ?? '');
  const [soloPseudo, setSoloPseudo] = useState(me.soloPseudo ?? '');
  const [platform, setPlatform] = useState<Platform>(me.platform ?? 'pc');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = useMutation({ mutationFn: saveProfile }).mutateAsync;

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await save({ duoPseudo, soloPseudo, platform });
      // The roster and the cards depend on the profile: a fresh load shows them as saved.
      location.assign('/');
    } catch (e) {
      setError(networkError(e));
      setBusy(false);
    }
  }

  return (
    <GatePage
      glow="radial-gradient(120% 70% at 50% -10%,rgba(40,90,170,.26),rgba(6,6,7,0) 70%)"
      glowHeight={380}
      className="lg:items-center lg:py-12"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 hidden bg-[radial-gradient(70%_60%_at_20%_0%,rgba(40,90,170,.3),rgba(6,6,7,0)_70%)] lg:block"
      />
      <form
        className="relative mx-auto flex w-full max-w-[400px] flex-col pt-[72px] lg:max-w-[880px] lg:flex-row lg:flex-wrap lg:items-start lg:gap-10 lg:pt-0"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
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
        <div className="flex flex-col gap-5 lg:flex-[1_1_418px] lg:rounded-3xl lg:border lg:border-white/6 lg:bg-[#111114] lg:p-7">
          <div className="flex flex-col gap-2">
            <GateLabel htmlFor="duo">Pseudo de ton compte duo</GateLabel>
            <GateField
              id="duo"
              autoComplete="nickname"
              placeholder="Nom d’utilisateur Epic"
              required
              autoFocus
              value={duoPseudo}
              disabled={busy}
              onChange={(event) => setDuoPseudo(event.target.value)}
              className="h-[52px]"
            />
            <span className="text-[12px] leading-[1.4] text-gate-muted">C’est le compte pour jouer avec tes amis.</span>
          </div>
          <div className="flex flex-col gap-2">
            <GateLabel htmlFor="solo">Pseudo de ton compte solo</GateLabel>
            <span className="text-[12px] leading-[1.4] text-gate-muted">(facultatif)</span>
            <GateField
              id="solo"
              placeholder="Nom d’utilisateur Epic"
              value={soloPseudo}
              disabled={busy}
              onChange={(event) => setSoloPseudo(event.target.value)}
              className="h-[52px]"
            />
          </div>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-2 p-0 text-[13px] font-semibold text-gate-soft">Plateforme</legend>
            <ToggleGroup
              aria-label="Plateforme"
              value={[platform]}
              onValueChange={(value: string[]) => {
                const [picked] = value;
                if (picked) setPlatform(picked as Platform);
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
          </fieldset>
          {error && <GateMessage tone="error">{error}</GateMessage>}
          <Button type="submit" variant="gate" size="gate" disabled={busy} className="-mt-3 w-full lg:mt-0">
            {busy ? 'Enregistrement…' : 'Let’s go'}
          </Button>
        </div>
      </form>
    </GatePage>
  );
}
