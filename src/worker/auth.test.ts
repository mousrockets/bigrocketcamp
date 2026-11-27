import { env, exports } from 'cloudflare:workers';
import { beforeEach, describe, expect, test } from 'vitest';

const origin = 'http://localhost';
const email = 'alice@example.com';

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function post(path: string, body: unknown, cookie?: string) {
  const headers: Record<string, string> = { Origin: origin, 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  return exports.default.fetch(`${origin}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function issueCode(code: string) {
  await env.DB.prepare(
    'INSERT INTO sign_in_codes (email, code_hash, expires, attempts, sent) VALUES (?, ?, ?, 0, 0) ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires = excluded.expires, attempts = 0',
  )
    .bind(email, await sha256(`${email}:${code}`), Date.now() + 60_000)
    .run();
}

async function signIn(): Promise<string> {
  await issueCode('123456');
  const response = await post('/api/auth/verify', { email, code: '123456' });
  expect(response.status).toBe(204);
  const cookie = response.headers.get('set-cookie') ?? '';
  expect(cookie).toMatch(/^session=[^;]+;.*HttpOnly/i);
  return cookie.split(';')[0] ?? '';
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions'),
    env.DB.prepare('DELETE FROM sign_in_codes'),
    env.DB.prepare('DELETE FROM members'),
    env.DB.prepare('INSERT INTO members (id, email) VALUES (?, ?)').bind('member-alice', email),
  ]);
});

describe('sign-in with an e-mail code', () => {
  test('the club data needs a session', async () => {
    const response = await exports.default.fetch(`${origin}/api/state`);
    expect(response.status).toBe(401);
  });

  test('an unknown address gets the same answer as a member, and no code', async () => {
    const response = await post('/api/auth/code', { email: 'stranger@example.com' });
    expect(response.status).toBe(204);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM sign_in_codes').first('n')).toBe(0);
  });

  test('a member receives a code, and asking again within a minute sends nothing new', async () => {
    // On this computer, with no mail service, the code comes back for the sign-in page to show.
    const asked = await post('/api/auth/code', { email: ' Alice@Example.com ' });
    expect(asked.status).toBe(200);
    const { devCode } = await asked.json<{ devCode: string }>();
    const sent = await env.DB.prepare('SELECT code_hash FROM sign_in_codes WHERE email = ?')
      .bind(email)
      .first('code_hash');
    expect(sent).toBe(await sha256(`${email}:${devCode}`));
    // The same answer as for an unknown address: asking twice does not reveal who is in the club.
    expect((await post('/api/auth/code', { email })).status).toBe(204);
    expect(
      await env.DB.prepare('SELECT code_hash FROM sign_in_codes WHERE email = ?').bind(email).first('code_hash'),
    ).toBe(sent);
  });

  test('a wrong code is counted, and five wrong codes lock the code', async () => {
    await issueCode('123456');
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await post('/api/auth/verify', { email, code: '000000' })).status).toBe(401);
    }
    expect((await post('/api/auth/verify', { email, code: '123456' })).status).toBe(401);
  });

  test('wrong codes sent all at once still lock the code after five', async () => {
    await issueCode('123456');
    const guesses = Array.from({ length: 20 }, (_, guess) => String(guess).padStart(6, '0'));
    await Promise.all(guesses.map((code) => post('/api/auth/verify', { email, code })));
    expect(
      await env.DB.prepare('SELECT attempts FROM sign_in_codes WHERE email = ?').bind(email).first('attempts'),
    ).toBe(5);
    expect((await post('/api/auth/verify', { email, code: '123456' })).status).toBe(401);
  });

  test('the right code sent twice at once opens a single session', async () => {
    await issueCode('123456');
    const answers = await Promise.all([1, 2].map(() => post('/api/auth/verify', { email, code: '123456' })));
    expect(answers.map((answer) => answer.status).sort()).toEqual([204, 401]);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first('n')).toBe(1);
  });

  test('the right code opens a session that reaches the API, once', async () => {
    const cookie = await signIn();
    const signedIn = await exports.default.fetch(`${origin}/api/exercise`, {
      method: 'DELETE',
      headers: { Origin: origin, Cookie: cookie },
      body: '{}',
    });
    expect(signedIn.status).toBe(400);
    expect((await post('/api/auth/verify', { email, code: '123456' })).status).toBe(401);
  });

  test('signing out closes the session', async () => {
    const cookie = await signIn();
    expect((await post('/api/auth/logout', {}, cookie)).status).toBe(204);
    const after = await exports.default.fetch(`${origin}/api/exercise`, {
      method: 'DELETE',
      headers: { Origin: origin, Cookie: cookie },
      body: '{}',
    });
    expect(after.status).toBe(401);
  });

  test('a code asked for on the club’s own address is never answered, even with no mail service', async () => {
    const remote = 'https://club.example';
    const response = await exports.default.fetch(`${remote}/api/auth/code`, {
      method: 'POST',
      headers: { Origin: remote, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    expect(response.status).not.toBe(200);
    expect(await response.text()).not.toMatch(/devCode|\d{6}/);
  });

  test('a request from another site is refused', async () => {
    const response = await exports.default.fetch(`${origin}/api/auth/code`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    expect(response.status).toBe(403);
  });
});
