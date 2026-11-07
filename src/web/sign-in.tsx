import { useMutation } from '@tanstack/react-query';
import { cn } from 'cn';
import { useState } from 'react';
import { useClubName } from './club';
import { ClubLogo } from './components/club/club-logo';
import { fieldVariants } from './components/club/page';
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

/** The design's "Fun assumé" words: the notice under the code, after sending it or sending it again. */
const codeNotice = 'Pas de code ? Jette un œil aux indésirables, il se cache parfois mieux qu’un gardien.';

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
      <div
        className={cn(
          'relative flex flex-col text-[#f4f5f7]',
          step === 'email' ? 'max-w-[560px] gap-3.5' : 'max-w-[520px] gap-3',
        )}
      >
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
      setNotice(codeNotice);
    } catch (e) {
      setError(networkError(e));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(typed: string = code) {
    if (busy) return;
    // The button stays white, as in the design, until all six digits are typed: it says what is missing.
    if (typed.length !== 6) {
      setError('Il manque des chiffres : le code en compte six.');
      document.getElementById('sign-in-code')?.focus();
      return;
    }
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

  // On a phone the design places each block from the top of an 844 px screen whose first 44 px are the status bar:
  // here they start from the safe area, at the design's offset minus those 44 px.
  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <Art step={step} />
      <main className="relative flex min-h-dvh flex-[1_1_420px] flex-col overflow-x-clip px-6 pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),34px)] lg:items-center lg:justify-center lg:px-[clamp(20px,5vw,64px)] lg:py-12">
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)-44px)] lg:hidden',
            step === 'email'
              ? 'h-[460px] bg-[radial-gradient(120%_70%_at_50%_-10%,rgb(40_90_170/0.32),transparent_70%)]'
              : 'h-[420px] bg-[radial-gradient(120%_70%_at_50%_-10%,rgb(40_90_170/0.26),transparent_70%)]',
          )}
        />
        {step === 'email' ? (
          <form
            className="relative flex w-full flex-1 flex-col gap-3.5 lg:max-w-[400px] lg:flex-none lg:gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              requestCode();
            }}
          >
            <PitchLines className="absolute top-[-4px] left-1/2 h-[300px] w-[390px] -translate-x-1/2 opacity-45 lg:hidden" />
            <div className="relative flex min-h-[394px] animate-up flex-col items-center gap-3.5 pt-[106px] text-center lg:min-h-0 lg:items-start lg:gap-4 lg:p-0 lg:text-left">
              <ClubLogo size={72} className="text-[28px] shadow-[0_12px_40px_rgb(61_139_255/0.25)] lg:hidden" />
              <span className="kicker">Espace réservé aux joueurs</span>
              <h1 className="font-display text-[40px] leading-none">Prêt pour le kickoff ?</h1>
              <p className="text-[15px] leading-[1.45] text-balance text-soft lg:mb-2 lg:leading-[1.5] lg:text-wrap">
                Ton e-mail, et on t’envoie un code à six chiffres. Plus rapide qu’un flip reset.
              </p>
            </div>
            <div className="relative flex animate-up flex-col gap-2">
              <Label htmlFor="sign-in-email" className="text-[13px] leading-[normal] font-semibold text-soft">
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
                className={fieldVariants({ size: 'xl' })}
              />
            </div>
            <Button type="submit" variant="inverse" size="2xl" disabled={busy} className="relative w-full">
              {busy ? 'Envoi…' : 'Envoie le code'}
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Button>
            <p className="relative mt-0.5 text-center text-[13px] text-muted-foreground lg:mt-0 lg:text-left">
              Aucun compte Epic ni mot de passe demandé.
            </p>
            {errorBox}
            <p className="relative mt-auto pt-8 text-center text-[11px] leading-[1.45] text-subtle lg:mt-6 lg:pt-0 lg:text-left">
              {epicNotice}
            </p>
          </form>
        ) : (
          <form
            className="relative flex w-full flex-col gap-[18px] pt-3.5 lg:max-w-[420px] lg:gap-4 lg:pt-0"
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
              className="-ml-2 text-foreground lg:hidden"
            >
              <svg
                aria-hidden="true"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </Button>
            <Button
              type="button"
              variant="link"
              onClick={changeEmail}
              disabled={busy}
              className="hidden h-11 self-start border-0 p-0 text-sm font-semibold text-link lg:inline-flex"
            >
              ← Changer d’adresse
            </Button>
            <div className="flex min-h-[192px] flex-col gap-3 pt-5 lg:min-h-0 lg:gap-4 lg:pt-0">
              <span className="kicker">Code à six chiffres</span>
              <h1 className="font-display text-[40px] leading-none">Check ta boîte mail</h1>
              <p className="text-[15px] leading-[1.45] text-soft lg:mb-1.5 lg:leading-[1.5]">
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
              onChange={(typed: string) => {
                setCode(typed);
                if (typed.length === 6) setError('');
              }}
              // Typing or pasting the sixth digit signs in, as the user expects from a one-time code.
              onComplete={(complete: string) => verifyCode(complete)}
              containerClassName="w-full"
            >
              <InputOTPGroup className="grid w-full grid-cols-6 gap-2 lg:gap-2.5">
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <InputOTPSlot
                    key={index}
                    index={index}
                    className="h-16 w-full rounded-[14px] border border-input bg-secondary font-heading text-[34px] font-extrabold [font-stretch:70%] first:rounded-[14px] last:rounded-[14px] data-[active=true]:border-primary data-[active=true]:ring-primary/25 lg:h-[68px] lg:text-4xl dark:bg-secondary [&>div>div]:h-7 [&>div>div]:w-0.5 [&>div>div]:animate-caret [&>div>div]:bg-primary lg:[&>div>div]:h-[30px]"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <Button type="submit" variant="inverse" size="2xl" disabled={busy} className="w-full">
              {busy ? 'Vérification…' : 'Je rentre sur le terrain'}
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
                className="min-h-11 border-0 px-2 text-sm font-semibold text-link lg:px-0"
              >
                Renvoyer le code
              </Button>
              <Button
                type="button"
                variant="link"
                disabled={busy}
                onClick={changeEmail}
                className="min-h-11 border-0 px-2 text-sm font-semibold text-link lg:hidden"
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
