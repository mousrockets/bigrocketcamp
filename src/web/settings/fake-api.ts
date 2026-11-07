import { vi } from 'vitest';

// A stand-in for the API in the Réglages tests: each route answers what the test says, and every request is kept.

export interface SentRequest {
  method: string;
  path: string;
  body: unknown;
}

type Answer = unknown | ((body: unknown) => unknown);

/** Answers `GET /api/members` and the like with the JSON given; a route not given answers 204. */
export function fakeApi(routes: Record<string, Answer> = {}): SentRequest[] {
  const sent: SentRequest[] = [];
  vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    const path = new URL(input, 'http://club.test').pathname;
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : (init.body ?? null);
    sent.push({ method, path, body });
    const route = `${method} ${path}`;
    if (!(route in routes)) return new Response(null, { status: 204 });
    const answer = routes[route];
    const json = typeof answer === 'function' ? answer(body) : answer;
    if (json instanceof Response) return json;
    return Response.json(json);
  });
  return sent;
}

/** The writes sent, without the reads. */
export const writes = (sent: SentRequest[]) => sent.filter((request) => request.method !== 'GET');
