import { useMutation } from '@tanstack/react-query';
import { ArrowRight, ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { ClubLogo } from '../brand/club-logo';
import { useClubName } from '../club';
import { Button } from '../components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../components/ui/input-otp';
import { requestSignInCode, verifySignInCode } from '../writes';
import { GateField, GateLabel, GateLead, GateMessage, GatePage, GateTitle, Kicker, networkError } from './gate';

const spamHint = 'Pas de code ? Jette un œil aux indésirables, il se cache parfois mieux qu’un gardien.';

/** Signing in with a six-digit code sent by email: no password, no Epic account. */
export function SignIn() {
  const [email, setEmail] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sendCode = useMutation({ mutationFn: requestSignInCode }).mutateAsync;

  async function requestCode() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await sendCode(email.trim());
      setCodeSent(true);
    } catch (e) {
      setError(networkError(e));
    } finally {
      setBusy(false);
    }
  }

  if (codeSent) {
    return (
      <CodeStep
        email={email.trim()}
        resend={requestCode}
        resending={busy}
        changeEmail={() => {
          setCodeSent(false);
          setError('');
        }}
      />
    );
  }

  return (
    <GatePage>
      <FieldLines />
      <div className="mx-auto flex w-full max-w-[400px] flex-col pt-[150px] lg:gap-10 lg:pt-0">
        <div className="flex min-h-[302px] animate-rise-in flex-col items-center gap-3.5 text-center lg:min-h-0">
          <ClubLogo className="size-[72px] rounded-[20px] text-[28px] shadow-[0_12px_40px_rgba(61,139,255,.25)]" />
          <Kicker>ESPACE RÉSERVÉ AUX JOUEURS</Kicker>
          <GateTitle className="text-[40px] lg:text-[44px]">Connexion</GateTitle>
          <GateLead className="text-balance">
            Ton e-mail, et on t’envoie un code à six chiffres. Plus rapide qu’un flip reset.
          </GateLead>
        </div>
        <form
          className="flex animate-rise-in flex-col gap-3.5 [animation-delay:.08s]"
          onSubmit={(event) => {
            event.preventDefault();
            requestCode();
          }}
        >
          <div className="flex flex-col gap-2">
            <GateLabel htmlFor="email">Adresse e-mail</GateLabel>
            <GateField
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="toi@exemple.fr"
              required
              value={email}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <Button type="submit" variant="gate" size="gate" disabled={busy}>
            {busy ? 'Envoi…' : 'Envoie le code'}
            {!busy && <ArrowRight strokeWidth={2.6} />}
          </Button>
          {error ? (
            <GateMessage tone="error">{error}</GateMessage>
          ) : (
            <p className="mt-0.5 mb-0 text-center text-[13px] text-gate-muted">
              Aucun compte Epic ni mot de passe demandé.
            </p>
          )}
        </form>
      </div>
    </GatePage>
  );
}

function CodeStep({
  email,
  resend,
  resending,
  changeEmail,
}: {
  email: string;
  resend: () => Promise<void>;
  resending: boolean;
  changeEmail: () => void;
}) {
  const clubName = useClubName() || 'ce club';
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const checkCode = useMutation({ mutationFn: verifySignInCode }).mutateAsync;
  const disabled = busy || resending;

  async function verify(typed: string = code) {
    if (disabled) return;
    setBusy(true);
    setError('');
    try {
      await checkCode({ email, code: typed });
      // The session cookie is set: reloading opens the page that was asked for.
      location.reload();
    } catch (e) {
      setError(networkError(e));
      setBusy(false);
    }
  }

  return (
    <GatePage
      glow="radial-gradient(120% 70% at 50% -10%,rgba(40,90,170,.26),rgba(6,6,7,0) 70%)"
      glowHeight={420}
      className="lg:py-16"
    >
      <div className="mx-auto flex w-full max-w-[400px] flex-col pt-[140px] lg:gap-8 lg:pt-0">
        <button
          type="button"
          aria-label="Retour"
          onClick={changeEmail}
          className="absolute top-[58px] left-4 flex size-11 items-center justify-center rounded-full bg-gate-field text-gate-text lg:static"
        >
          <ChevronLeft className="size-5" strokeWidth={2.4} />
        </button>
        <div className="flex min-h-[190px] flex-col gap-3 lg:min-h-0">
          <Kicker>CODE À SIX CHIFFRES</Kicker>
          <GateTitle className="text-[40px] lg:text-[44px]">Check ta boîte mail</GateTitle>
          <GateLead>
            Si <b className="font-semibold text-gate-text">{email}</b> est inscrite chez {clubName}, un code vient d’y
            être envoyé.
          </GateLead>
        </div>
        <form
          className="flex flex-col gap-[18px]"
          onSubmit={(event) => {
            event.preventDefault();
            verify();
          }}
        >
          <InputOTP
            maxLength={6}
            pattern="^[0-9]*$"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            aria-label="Code à six chiffres"
            value={code}
            disabled={disabled}
            onChange={setCode}
            // Typing or pasting the sixth digit signs in, as the user expects from a one-time code.
            onComplete={(complete: string) => verify(complete)}
            containerClassName="w-full"
          >
            <InputOTPGroup className="grid w-full grid-cols-6 gap-2">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <InputOTPSlot
                  key={index}
                  index={index}
                  caretClassName="h-7 w-0.5 bg-gate-focus"
                  className="h-16 w-full rounded-[14px] border border-white/12 bg-gate-field font-display font-extrabold text-[34px] text-gate-text [font-stretch:70%] first:rounded-[14px] last:rounded-[14px] data-[active=true]:border-gate-focus data-[active=true]:ring-[3px] data-[active=true]:ring-gate-focus/25 dark:bg-gate-field"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <Button type="submit" variant="gate" size="gate" disabled={disabled || code.length !== 6}>
            {busy ? 'Vérification…' : 'Je rentre sur le terrain'}
          </Button>
          <GateMessage tone={error ? 'error' : 'info'}>{error || spamHint}</GateMessage>
          <div className="flex justify-center gap-2">
            <Button type="button" variant="gate-link" size="gate-link" disabled={disabled} onClick={resend}>
              {resending ? 'Envoi…' : 'Renvoyer le code'}
            </Button>
            <Button type="button" variant="gate-link" size="gate-link" disabled={disabled} onClick={changeEmail}>
              Changer d’adresse
            </Button>
          </div>
        </form>
      </div>
    </GatePage>
  );
}

/** The centre circle and halfway line of a pitch, faint behind the title. */
function FieldLines() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 390 300"
      className="absolute top-10 left-1/2 h-[300px] w-[390px] -translate-x-1/2 overflow-visible opacity-45 lg:h-[340px] lg:w-[560px]"
    >
      <g fill="none" stroke="rgba(122,184,255,.2)" strokeWidth="1.5">
        <circle cx="195" cy="150" r="90" />
        <path d="M-200 150H590" />
        <circle cx="195" cy="150" r="4" fill="rgba(122,184,255,.35)" />
      </g>
    </svg>
  );
}
