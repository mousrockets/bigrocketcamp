import { useMutation } from '@tanstack/react-query';
import { cn } from 'cn';
import { ArrowRightIcon, ChevronLeftIcon } from 'lucide-react';
import { useState } from 'react';
import { useClubName } from './club';
import { ClubLogo } from './components/club/club-logo';
import { fieldClass } from './components/club/page';
import { PitchArt, PitchLines } from './components/club/pitch-art';
import { Alert, AlertDescription } from './components/ui/alert';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from './components/ui/input-otp';
import { Label } from './components/ui/label';
import { requestSignInCode, verifySignInCode } from './writes';

// Signing in: an e-mail, then the six-digit code sent to it. No password, no Epic account.

type Step = 'email' | 'code';

const networkError = (e: unknown) =>
  e instanceof TypeError ? 'Connexion Internet indisponible. Réessaie dans un instant.' : (e as Error).message;

const epicNotice =
  'Ce produit n’est pas officiel et n’a pas l’approbation d’Epic Games. Rocket League et ses éléments appartiennent à Epic Games, Inc.';

/** The left half of a wide screen: the pitch and the club's motto. */
function Art({ step }: { step: Step }) {
  return (
    <section
      aria-hidden="true"
      className="relative hidden min-h-dvh flex-[1_1_480px] flex-col justify-end overflow-hidden bg-[#08101f] p-[clamp(24px,5vw,64px)] lg:flex"
    >
      <PitchArt ball={step === 'email' ? 'center' : 'right'} goals={step === 'email'} />
      <div className="relative flex max-w-[560px] flex-col gap-3.5 text-[#f4f5f7]">
        {step === 'email' ? (
          <>
            <ClubLogo size={56} className="bg-[#f4f5f7] text-[#060607]" />
            <p className="font-display text-[clamp(36px,4.4vw,64px)] leading-[0.95]">
              On perd ensemble.
              <br />
              <span className="text-[#7ab8ff]">On pousse ensemble.</span>
            </p>
            <p className="text-[15px] text-[#b7c4dc]">
              Une défaite, 5 pompes. Pompes, gainage ou abdos : chaque effort compte.
            </p>
          </>
        ) : (
          <>
            <span className="kicker text-[#b7c4dc]">Étape 2 sur 2</span>
            <p className="font-display text-[clamp(32px,3.6vw,52px)] leading-[0.98]">
              Un code, et tu es sur le terrain.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

export function SignIn() {
  const clubName = useClubName() || 'ce club';
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sendCode = useMutation({ mutationFn: requestSignInCode }).mutateAsync;
  const checkCode = useMutation({ mutationFn: verifySignInCode }).mutateAsync;

  async function requestCode() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await sendCode(email.trim());
      setStep('code');
      setCode('');
      setNotice('Code envoyé. Pense à regarder dans les courriers indésirables.');
    } catch (e) {
      setError(networkError(e));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(typed: string = code) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await checkCode({ email: email.trim(), code: typed });
      // The session cookie is set: reloading opens the page that was asked for.
      location.reload();
    } catch (e) {
      setError(networkError(e));
      setBusy(false);
    }
  }

  function changeEmail() {
    setStep('email');
    setCode('');
    setError('');
    setNotice('');
  }

  const errorBox = error && (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <Art step={step} />
      <main className="relative flex min-h-dvh flex-[1_1_420px] flex-col overflow-x-clip px-6 pt-[calc(env(safe-area-inset-top)+16px)] pb-[max(env(safe-area-inset-bottom),28px)] lg:items-center lg:justify-center lg:px-[clamp(20px,5vw,64px)] lg:py-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[460px] bg-[radial-gradient(120%_70%_at_50%_-10%,rgb(40_90_170/0.32),transparent_70%)] lg:hidden"
        />
        {step === 'email' ? (
          <form
            className="relative flex w-full flex-1 flex-col gap-3.5 lg:max-w-[400px] lg:flex-none lg:gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              requestCode();
            }}
          >
            <PitchLines className="absolute top-6 left-1/2 w-[390px] -translate-x-1/2 opacity-45 lg:hidden" />
            <div className="relative flex animate-up flex-col items-center gap-3.5 pt-[100px] pb-10 text-center lg:items-start lg:p-0 lg:text-left">
              <ClubLogo size={72} className="text-[28px] shadow-[0_12px_40px_rgb(61_139_255/0.25)] lg:hidden" />
              <span className="kicker">Espace réservé aux joueurs</span>
              <h1 className="font-display text-[40px] leading-none">Connexion</h1>
              <p className="text-[15px] leading-[1.45] text-balance text-soft lg:mb-2 lg:leading-normal">
                Saisis ton adresse e-mail : si elle est inscrite chez {clubName}, tu recevras un code de connexion à six
                chiffres.
              </p>
            </div>
            <div className="relative flex animate-up flex-col gap-2">
              <Label htmlFor="sign-in-email" className="text-[13px] font-semibold text-soft">
                Adresse e-mail
              </Label>
              <Input
                id="sign-in-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="toi@exemple.fr"
                required
                value={email}
                disabled={busy}
                onChange={(event) => setEmail(event.target.value)}
                className={cn(fieldClass, 'h-[54px] text-[17px] md:text-[17px]')}
              />
            </div>
            <Button type="submit" variant="inverse" size="xl" disabled={busy} className="relative h-[54px] w-full">
              {busy ? 'Envoi…' : 'Recevoir mon code'}
              <ArrowRightIcon />
            </Button>
            <p className="relative text-center text-[13px] text-muted-foreground lg:text-left">
              Aucun compte Epic ni mot de passe demandé.
            </p>
            {errorBox}
            <p className="relative mt-auto pt-8 text-center text-[11px] leading-[1.45] text-[#8e9097] lg:mt-6 lg:pt-0 lg:text-left">
              {epicNotice}
            </p>
          </form>
        ) : (
          <form
            className="relative flex w-full flex-col gap-[18px] lg:max-w-[420px] lg:gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              verifyCode();
            }}
          >
            <Button
              type="button"
              variant="secondary"
              size="icon-xl"
              aria-label="Changer d’adresse e-mail"
              onClick={changeEmail}
              disabled={busy}
              className="mt-[42px] lg:hidden"
            >
              <ChevronLeftIcon className="size-[22px]" />
            </Button>
            <Button
              type="button"
              variant="link"
              onClick={changeEmail}
              disabled={busy}
              className="hidden h-11 self-start p-0 text-sm font-semibold text-link lg:inline-flex"
            >
              ← Changer d’adresse
            </Button>
            <div className="flex flex-col gap-3 pt-8 lg:pt-0">
              <span className="kicker">Code à six chiffres</span>
              <h1 className="font-display text-[40px] leading-none">Vérifie tes e-mails</h1>
              <p className="text-[15px] leading-[1.45] text-soft">
                Si <b className="font-semibold text-foreground">{email.trim()}</b> est inscrite chez {clubName}, un code
                vient d’y être envoyé.
              </p>
            </div>
            <Label htmlFor="sign-in-code" className="sr-only">
              Code à six chiffres
            </Label>
            <InputOTP
              id="sign-in-code"
              maxLength={6}
              pattern="^[0-9]*$"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              disabled={busy}
              onChange={setCode}
              // Typing or pasting the sixth digit signs in, as the user expects from a one-time code.
              onComplete={(complete: string) => verifyCode(complete)}
              containerClassName="w-full"
            >
              <InputOTPGroup className="grid w-full grid-cols-6 gap-2 lg:gap-2.5">
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <InputOTPSlot
                    key={index}
                    index={index}
                    className="h-16 w-full rounded-[14px] border border-input bg-secondary font-numeral text-[34px] first:rounded-[14px] last:rounded-[14px] lg:h-[68px] lg:text-4xl dark:bg-secondary"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <Button
              type="submit"
              variant="inverse"
              size="xl"
              disabled={busy || code.length !== 6}
              className="h-[54px] w-full"
            >
              {busy ? 'Vérification…' : 'Se connecter'}
            </Button>
            {notice && (
              <p
                role="status"
                className="rounded-xl bg-primary/10 px-3.5 py-3 text-[13px] leading-[1.4] text-primary dark:text-[#c9dcff]"
              >
                {notice}
              </p>
            )}
            {errorBox}
            <div className="flex justify-center gap-2 lg:justify-start">
              <Button
                type="button"
                variant="link"
                disabled={busy}
                onClick={requestCode}
                className="min-h-11 px-2 text-sm font-semibold text-link lg:px-0"
              >
                Renvoyer le code
              </Button>
              <Button
                type="button"
                variant="link"
                disabled={busy}
                onClick={changeEmail}
                className="min-h-11 px-2 text-sm font-semibold text-link lg:hidden"
              >
                Changer d’adresse
              </Button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
