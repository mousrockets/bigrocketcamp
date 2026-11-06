import { useState } from 'react';
import { clubName } from '../lib/club';
import { Brand } from './brand';
import { InputOTP, InputOTPGroup, InputOTPSlot } from './components/ui/input-otp';

type Step = 'email' | 'code';

async function postJson(path: string, body: Record<string, string>) {
  return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function errorOf(response: Response, fallback: string) {
  try {
    const result = (await response.json()) as { error?: string };
    return result.error || fallback;
  } catch {
    return fallback;
  }
}

export function SignIn() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function requestCode() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await postJson('/api/auth/code', { email: email.trim() });
      if (!response.ok) throw Error(await errorOf(response, 'Impossible d’envoyer le code. Réessaie dans un instant.'));
      setStep('code');
      setCode('');
      setNotice('Code envoyé. Pense à regarder dans les courriers indésirables.');
    } catch (e) {
      setError(
        e instanceof TypeError ? 'Connexion Internet indisponible. Réessaie dans un instant.' : (e as Error).message,
      );
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
      const response = await postJson('/api/auth/verify', { email: email.trim(), code: typed });
      if (!response.ok) throw Error(await errorOf(response, 'Code incorrect ou expiré.'));
      // The session cookie is set: reloading opens the page that was asked for.
      location.reload();
    } catch (e) {
      setError(
        e instanceof TypeError ? 'Connexion Internet indisponible. Réessaie dans un instant.' : (e as Error).message,
      );
      setBusy(false);
    }
  }

  function changeEmail() {
    setStep('email');
    setCode('');
    setError('');
    setNotice('');
  }

  return (
    <main>
      <header>
        <Brand />
      </header>
      <section className="sign-in">
        <p className="eyebrow">ESPACE RÉSERVÉ AUX JOUEURS</p>
        <h1>Connexion</h1>
        <p className="muted">
          {step === 'email'
            ? `Saisis ton adresse e-mail : si elle est inscrite chez ${clubName}, tu recevras un code de connexion à six chiffres.`
            : `Si ${email.trim()} est inscrite chez ${clubName}, un code à six chiffres vient d’y être envoyé.`}
        </p>
        {step === 'email' ? (
          <form
            className="sign-in-form"
            onSubmit={(event) => {
              event.preventDefault();
              requestCode();
            }}
          >
            <label>
              Adresse e-mail
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                disabled={busy}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Envoi…' : 'Recevoir mon code →'}
            </button>
          </form>
        ) : (
          <form
            className="sign-in-form"
            onSubmit={(event) => {
              event.preventDefault();
              verifyCode();
            }}
          >
            <label htmlFor="sign-in-code">Code à six chiffres</label>
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
              containerClassName="sign-in-code"
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <InputOTPSlot key={index} index={index} className="size-12 text-xl" />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <button type="submit" className="primary" disabled={busy || code.length !== 6}>
              {busy ? 'Vérification…' : 'Me connecter →'}
            </button>
            <p className="small muted">
              Pas reçu ?{' '}
              <button type="button" className="link" disabled={busy} onClick={requestCode}>
                Renvoyer un code
              </button>{' '}
              ·{' '}
              <button type="button" className="link" disabled={busy} onClick={changeEmail}>
                Changer d’adresse e-mail
              </button>
            </p>
          </form>
        )}
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="win" role="status">
            {notice}
          </p>
        )}
      </section>
    </main>
  );
}
