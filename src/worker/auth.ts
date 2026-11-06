import { eq, sql } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Role } from '../lib/members';
import { orm } from '../lib/orm';
import { members, sessions, signInCodes } from '../lib/schema';

export interface Member {
  id: string;
  email: string;
  role: Role;
}

/** `collector` names the paired collector device when the request carries its token instead of a session. */
export type AppEnv = { Bindings: Env; Variables: { member: Member; collector?: string } };

const sessionCookie = 'session';
const day = 24 * 60 * 60 * 1000;
const sessionLifetime = 365 * day;
const codeLifetime = 10 * 60 * 1000;
const codeResendDelay = 60 * 1000;
const codeAttempts = 5;

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomToken(): string {
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
  const db = orm(env.DB);
  const [member] = await db.select({ id: members.id }).from(members).where(eq(members.email, email));
  const [previous] = await db.select({ sent: signInCodes.sent }).from(signInCodes).where(eq(signInCodes.email, email));
  if (previous && Date.now() - previous.sent < codeResendDelay) return 'too-soon';
  // An unknown address gets the same answer as a member, so the form never reveals who is in the club.
  if (!member) return 'sent';

  const code = randomCode();
  const now = Date.now();
  const saved = { codeHash: await sha256(`${email}:${code}`), expires: now + codeLifetime, attempts: 0, sent: now };
  await db
    .insert(signInCodes)
    .values({ email, ...saved })
    .onConflictDoUpdate({ target: signInCodes.email, set: saved });
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
  const db = orm(c.env.DB);
  const [saved] = await db.select().from(signInCodes).where(eq(signInCodes.email, email));
  if (!saved || saved.expires < Date.now() || saved.attempts >= codeAttempts) return false;
  if (saved.codeHash !== (await sha256(`${email}:${code}`))) {
    await db
      .update(signInCodes)
      .set({ attempts: sql`${signInCodes.attempts} + 1` })
      .where(eq(signInCodes.email, email));
    return false;
  }
  const [member] = await db.select({ id: members.id }).from(members).where(eq(members.email, email));
  await db.delete(signInCodes).where(eq(signInCodes.email, email));
  if (!member) return false;
  await openSession(c, member.id);
  return true;
}

async function openSession(c: Context<AppEnv>, memberId: string): Promise<void> {
  const token = randomToken();
  await orm(c.env.DB)
    .insert(sessions)
    .values({ tokenHash: await sha256(token), memberId, expires: Date.now() + sessionLifetime });
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

/** Forgets the browser's session cookie, once its session is gone from the database. */
export function clearSessionCookie(c: Context): void {
  deleteCookie(c, sessionCookie, { path: '/' });
}

export async function closeSession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, sessionCookie);
  if (token)
    await orm(c.env.DB)
      .delete(sessions)
      .where(eq(sessions.tokenHash, await sha256(token)));
  clearSessionCookie(c);
}

/** Rejects the request with 401 unless it carries a live session; a session in use never expires. */
export const requireMember: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, sessionCookie);
  if (!token) return c.json({ error: 'Connexion requise.' }, 401);
  const tokenHash = await sha256(token);
  const db = orm(c.env.DB);
  const [session] = await db
    .select({ id: members.id, email: members.email, role: members.role, expires: sessions.expires })
    .from(sessions)
    .innerJoin(members, eq(members.id, sessions.memberId))
    .where(eq(sessions.tokenHash, tokenHash));
  if (!session || session.expires < Date.now()) return c.json({ error: 'Connexion requise.' }, 401);
  if (session.expires - Date.now() < sessionLifetime - day) {
    await db
      .update(sessions)
      .set({ expires: Date.now() + sessionLifetime })
      .where(eq(sessions.tokenHash, tokenHash));
    writeSessionCookie(c, token);
  }
  c.set('member', { id: session.id, email: session.email, role: session.role });
  await next();
};

/** After requireMember: rejects the request with 403 unless the member administers the club. */
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.var.member.role !== 'admin') return c.json({ error: 'Réservé aux administrateurs du club.' }, 403);
  await next();
};
