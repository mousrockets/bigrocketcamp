import { describe, expect, it } from 'vitest';
import { cacheFirst, copiesOf, type Network, networkFirst, type Store } from './strategies';

const origin = 'https://club.example.com';

class MemoryStore implements Store {
  readonly entries = new Map<string, Response>();
  async match(key: RequestInfo) {
    return this.entries.get(keyOf(key))?.clone();
  }
  async put(key: RequestInfo, response: Response) {
    this.entries.set(keyOf(key), response);
  }
}

const keyOf = (key: RequestInfo) => new URL(typeof key === 'string' ? key : key.url, origin).pathname;
const html = (body: string) => new Response(body, { headers: { 'content-type': 'text/html' } });
const offline = () => Promise.reject(new TypeError('Failed to fetch'));

function setup(fetcher: Network['fetcher']) {
  const cache = new MemoryStore();
  const kept: Promise<unknown>[] = [];
  const network: Network = { cache, fetcher, keepAlive: (work) => kept.push(work) };
  return { cache, network, settled: () => Promise.all(kept) };
}

describe('networkFirst', () => {
  it('answers from the network and keeps a copy', async () => {
    const { cache, network } = setup(async () => html('new'));
    const response = await networkFirst(new Request(`${origin}/profil`), network, { key: '/', page: true });
    expect(await response.text()).toBe('new');
    expect(await (await cache.match('/'))?.text()).toBe('new');
  });

  it('opens the copy when the network is down', async () => {
    const { cache, network } = setup(offline);
    await cache.put('/', html('copy'));
    const response = await networkFirst(new Request(`${origin}/`), network, { key: '/', page: true });
    expect(await response.text()).toBe('copy');
  });

  it('fails like the network when there is no copy', async () => {
    const { network } = setup(offline);
    await expect(networkFirst(new Request(`${origin}/`), network)).rejects.toThrow('Failed to fetch');
  });

  it('opens the copy on a slow network, and stores the late answer for next time', async () => {
    let answer: (response: Response) => void = () => {};
    const { cache, network, settled } = setup(() => new Promise((resolve) => (answer = resolve)));
    await cache.put('/', html('copy'));
    const response = await networkFirst(new Request(`${origin}/`), network, { key: '/', page: true, timeoutMs: 5 });
    expect(await response.text()).toBe('copy');
    answer(html('late'));
    await settled();
    expect(await (await cache.match('/'))?.text()).toBe('late');
  });

  it('waits for a slow network when there is no copy', async () => {
    const { network } = setup(() => new Promise((resolve) => setTimeout(resolve, 20, html('slow'))));
    const response = await networkFirst(new Request(`${origin}/`), network, { timeoutMs: 5 });
    expect(await response.text()).toBe('slow');
  });

  it('never replaces the shell with an error, a redirect or a file that is not a page', async () => {
    const answers = [
      new Response('gone', { status: 404, headers: { 'content-type': 'text/html' } }),
      new Response(null, { status: 302, headers: { location: '/' } }),
      new Response('{}', { headers: { 'content-type': 'image/png' } }),
    ];
    const { cache, network } = setup(async () => answers.shift() ?? html('unexpected'));
    await cache.put('/', html('shell'));
    for (let call = 0; call < 3; call++) {
      await networkFirst(new Request(`${origin}/icons/icon-192.png`), network, { key: '/', page: true });
    }
    expect(await (await cache.match('/'))?.text()).toBe('shell');
  });
});

describe('cacheFirst', () => {
  it('reads a build file once from the network, then from its copy', async () => {
    let calls = 0;
    const { network } = setup(async () => {
      calls++;
      return new Response('code');
    });
    const request = () => new Request(`${origin}/assets/index-a1b2.js`);
    expect(await (await cacheFirst(request(), network)).text()).toBe('code');
    expect(await (await cacheFirst(request(), network)).text()).toBe('code');
    expect(calls).toBe(1);
  });

  it('keeps no copy of a missing file', async () => {
    const { cache, network } = setup(async () => new Response('missing', { status: 404 }));
    await cacheFirst(new Request(`${origin}/assets/old-a1b2.js`), network);
    expect(cache.entries.size).toBe(0);
  });
});

describe('copiesOf', () => {
  it('finds a copy whatever the Origin header of the request, despite Vary: Origin', async () => {
    const options: (CacheQueryOptions | undefined)[] = [];
    const cache = {
      match: async (_key: RequestInfo, query?: CacheQueryOptions) => {
        options.push(query);
        return query?.ignoreVary ? new Response('code') : undefined;
      },
      put: async () => {},
    };
    const request = new Request(`${origin}/assets/index-a1b2.js`, { headers: { origin } });
    expect(await (await copiesOf(cache).match(request))?.text()).toBe('code');
    expect(options).toEqual([{ ignoreVary: true }]);
  });
});
