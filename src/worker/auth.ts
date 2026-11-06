import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

export interface Member {
  id: string;
  email: string;
}

export type AppEnv = { Bindings: Env; Variables: { member: Member } };

const sessionCookie = 'session';
const day = 24 * 60 * 60 * 1000;
const sessionLifetime = 365 * day;
const codeLifetime = 10 * 60 * 1000;
const codeResendDelay = 60 * 1000;
const codeAttempts = 5;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function randomCode(): string {
  // Rejection sampling keeps every code equally likely.
  const [value = 0] = crypto.getRandomValues(new Uint32Array(1));
  return value < 4_294_000_000 ? String(value % 1_000_000).padStart(6, '0') : randomCode();
}

export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const email = input.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** Every mutating request must come from the app's own pages. */
export function sameOrigin(c: Context): boolean {
  return c.req.header('origin') === new URL(c.req.url).origin;
}

export async function sendSignInCode(env: Env, email: string, requestUrl: string): Promise<'sent' | 'too-soon'> {
  const db = env.DB;
  const member = await db.prepare('SELECT id FROM members WHERE email = ?').bind(email).first();
  const previous = await db
    .prepare('SELECT sent FROM sign_in_codes WHERE email = ?')
    .bind(email)
    .first<{ sent: number }>();
  if (previous && Date.now() - previous.sent < codeResendDelay) return 'too-soon';
  // An unknown address gets the same answer as a member, so the form never reveals who is in the club.
  if (!member) return 'sent';

  const code = randomCode();
  const now = Date.now();
  await db
    .prepare(
      'INSERT INTO sign_in_codes (email, code_hash, expires, attempts, sent) VALUES (?, ?, ?, 0, ?) ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires = excluded.expires, attempts = 0, sent = excluded.sent',
    )
    .bind(email, await sha256(`${email}:${code}`), now + codeLifetime, now)
    .run();
  await deliver(env, email, code, requestUrl);
  return 'sent';
}

async function deliver(env: Env, email: string, code: string, requestUrl: string): Promise<void> {
  const host = new URL(requestUrl).hostname;
  if (!env.MAIL_FROM && env.RESEND_API_KEY) throw new Error('MAIL_FROM is not set.');
  if (!env.RESEND_API_KEY) {
    if (host === '127.0.0.1' || host === 'localhost') {
      console.log(`Sign-in code for ${email}: ${code}`);
      return;
    }
    throw new Error('RESEND_API_KEY is not set.');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: email,
      subject: `Ton code de connexion : ${code}`,
      text: `Ton code de connexion est ${code}. Il expire dans 10 minutes.\n\nSi tu n'as rien demandé, ignore ce message.`,
    }),
  });
  if (!response.ok) {
    // Resend explains a refusal in its body (a missing sender, an unverified domain): keep it for the logs.
    const reason = await response.text().catch(() => '');
    throw new Error(`Resend answered ${response.status}: ${reason.slice(0, 300)}`);
  }
}

export async function verifySignInCode(c: Context<AppEnv>, email: string, code: string): Promise<boolean> {
  const db = c.env.DB;
  const saved = await db
    .prepare('SELECT code_hash, expires, attempts FROM sign_in_codes WHERE email = ?')
    .bind(email)
    .first<{ code_hash: string; expires: number; attempts: number }>();
  if (!saved || saved.expires < Date.now() || saved.attempts >= codeAttempts) return false;
  if (saved.code_hash !== (await sha256(`${email}:${code}`))) {
    await db.prepare('UPDATE sign_in_codes SET attempts = attempts + 1 WHERE email = ?').bind(email).run();
    return false;
  }
  const member = await db.prepare('SELECT id FROM members WHERE email = ?').bind(email).first<{ id: string }>();
  await db.prepare('DELETE FROM sign_in_codes WHERE email = ?').bind(email).run();
  if (!member) return false;
  await openSession(c, member.id);
  return true;
}

async function openSession(c: Context<AppEnv>, memberId: string): Promise<void> {
  const token = randomToken();
  const expires = Date.now() + sessionLifetime;
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, member_id, expires) VALUES (?, ?, ?)')
    .bind(await sha256(token), memberId, expires)
    .run();
  writeSessionCookie(c, token);
}

function writeSessionCookie(c: Context, token: string): void {
  setCookie(c, sessionCookie, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: sessionLifetime / 1000,
  });
}

export async function closeSession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, sessionCookie);
  if (token)
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
      .bind(await sha256(token))
      .run();
  deleteCookie(c, sessionCookie, { path: '/' });
}

/** Rejects the request with 401 unless it carries a live session; a session in use never expires. */
export const requireMember: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, sessionCookie);
  if (!token) return c.json({ error: 'Connexion requise.' }, 401);
  const tokenHash = await sha256(token);
  const session = await c.env.DB.prepare(
    'SELECT members.id, members.email, sessions.expires FROM sessions JOIN members ON members.id = sessions.member_id WHERE sessions.token_hash = ?',
  )
    .bind(tokenHash)
    .first<Member & { expires: number }>();
  if (!session || session.expires < Date.now()) return c.json({ error: 'Connexion requise.' }, 401);
  if (session.expires - Date.now() < sessionLifetime - day) {
    await c.env.DB.prepare('UPDATE sessions SET expires = ? WHERE token_hash = ?')
      .bind(Date.now() + sessionLifetime, tokenHash)
      .run();
    writeSessionCookie(c, token);
  }
  c.set('member', { id: session.id, email: session.email });
  await next();
};
