import { useForm } from '@tanstack/react-form';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { signInCode, signInEmail } from '../../lib/contract';
import { useClubName } from '../club';
import { ClubLogo } from '../components/club-logo';
import { Button } from '../components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../components/ui/input-otp';
import { requestSignInCode, verifySignInCode } from '../writes';
import {
  GateField,
  GateFieldError,
  GateFormField,
  GateLabel,
  GateLead,
  GateMessage,
  GatePage,
  GateTitle,
  Kicker,
  networkError,
} from './gate';

const spamHint = 'Pas de code ? Jette un œil aux indésirables, il se cache parfois mieux qu’un gardien.';

/** Signing in with a six-digit code sent by email: no password, no Epic account. */
export function SignIn() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const sendCode = useMutation({ mutationFn: requestSignInCode });
  const form = useForm({
    defaultValues: { email: '' },
    validators: { onSubmit: signInEmail },
    onSubmit: async ({ value }) => {
      const email = value.email.trim();
      // A refusal stays on the mutation, which the page shows.
      await sendCode.mutateAsync(email).then(
        () => setSentTo(email),
        () => {},
      );
    },
  });

  if (sentTo !== null) {
    return (
      <CodeStep
        email={sentTo}
        resend={() => sendCode.mutateAsync(sentTo).catch(() => {})}
        resending={sendCode.isPending}
        resendError={sendCode.error ? networkError(sendCode.error) : ''}
        changeEmail={() => {
          sendCode.reset();
          setSentTo(null);
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
          noValidate
          className="flex animate-rise-in flex-col gap-3.5 [animation-delay:.08s]"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="email">
            {(field) => (
              <GateFormField data-invalid={!field.state.meta.isValid || undefined}>
                <GateLabel htmlFor={field.name}>Adresse e-mail</GateLabel>
                <GateField
                  id={field.name}
                  name={field.name}
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="toi@exemple.fr"
                  aria-invalid={!field.state.meta.isValid || undefined}
                  value={field.state.value}
                  disabled={sendCode.isPending}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <GateFieldError errors={field.state.meta.errors} />
              </GateFormField>
            )}
          </form.Field>
          <Button type="submit" variant="gate" size="gate" disabled={sendCode.isPending}>
            {sendCode.isPending ? 'Envoi…' : 'Envoie le code'}
            {!sendCode.isPending && <ArrowRight strokeWidth={2.6} />}
          </Button>
          {sendCode.error ? (
            <GateMessage tone="error">{networkError(sendCode.error)}</GateMessage>
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
  resendError,
  changeEmail,
}: {
  email: string;
  resend: () => Promise<unknown>;
  resending: boolean;
  resendError: string;
  changeEmail: () => void;
}) {
  const clubName = useClubName() || 'ce club';
  const verify = useMutation({
    mutationFn: verifySignInCode,
    // The session cookie is set: reloading opens the page that was asked for.
    onSuccess: () => location.reload(),
  });
  const form = useForm({
    defaultValues: { email, code: '' },
    validators: { onSubmit: signInCode },
    onSubmit: ({ value }) => verify.mutateAsync(value).catch(() => {}),
  });
  // A successful check reloads the page: the form stays busy until then.
  const busy = verify.isPending || verify.isSuccess || resending;
  const error = verify.error ? networkError(verify.error) : resendError;

  return (
    <GatePage
      glow="radial-gradient(120% 70% at 50% -10%,rgba(40,90,170,.26),rgba(6,6,7,0) 70%)"
      glowHeight={420}
      className="lg:py-16"
    >
      <div className="mx-auto flex w-full max-w-[400px] flex-col pt-[140px] lg:gap-8 lg:pt-0">
        <Button
          variant="ghost"
          aria-label="Retour"
          onClick={changeEmail}
          className="absolute top-[58px] left-4 size-11 rounded-full bg-gate-field p-0 text-gate-text hover:bg-gate-field hover:text-white lg:static [&_svg:not([class*='size-'])]:size-5"
        >
          <ChevronLeft strokeWidth={2.4} />
        </Button>
        <div className="flex min-h-[190px] flex-col gap-3 lg:min-h-0">
          <Kicker>CODE À SIX CHIFFRES</Kicker>
          <GateTitle className="text-[40px] lg:text-[44px]">Check ta boîte mail</GateTitle>
          <GateLead>
            Si <b className="font-semibold text-gate-text">{email}</b> est inscrite chez {clubName}, un code vient d’y
            être envoyé.
          </GateLead>
        </div>
        <form
          noValidate
          className="flex flex-col gap-[18px]"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="code">
            {(field) => (
              <InputOTP
                maxLength={6}
                pattern="^[0-9]*$"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                aria-label="Code à six chiffres"
                value={field.state.value}
                disabled={busy}
                onChange={field.handleChange}
                // Typing or pasting the sixth digit signs in, as the member expects from a one-time code.
                onComplete={() => void form.handleSubmit()}
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
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.code.length === 6}>
            {(complete) => (
              <Button type="submit" variant="gate" size="gate" disabled={busy || !complete}>
                {verify.isPending ? 'Vérification…' : 'Je rentre sur le terrain'}
              </Button>
            )}
          </form.Subscribe>
          <GateMessage tone={error ? 'error' : 'info'}>{error || spamHint}</GateMessage>
          <div className="flex justify-center gap-2">
            <Button type="button" variant="gate-link" size="gate-link" disabled={busy} onClick={() => void resend()}>
              {resending ? 'Envoi…' : 'Renvoyer le code'}
            </Button>
            <Button type="button" variant="gate-link" size="gate-link" disabled={busy} onClick={changeEmail}>
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
