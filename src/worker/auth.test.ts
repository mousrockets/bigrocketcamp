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

  test('a member receives a code, and cannot ask again within a minute', async () => {
    expect((await post('/api/auth/code', { email: ' Alice@Example.com ' })).status).toBe(204);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM sign_in_codes WHERE email = ?').bind(email).first('n')).toBe(
      1,
    );
    expect((await post('/api/auth/code', { email })).status).toBe(429);
  });

  test('a wrong code is counted, and five wrong codes lock the code', async () => {
    await issueCode('123456');
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await post('/api/auth/verify', { email, code: '000000' })).status).toBe(401);
    }
    expect((await post('/api/auth/verify', { email, code: '123456' })).status).toBe(401);
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

  test('a request from another site is refused', async () => {
    const response = await exports.default.fetch(`${origin}/api/auth/code`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    expect(response.status).toBe(403);
  });
});
