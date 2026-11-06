// Written by hand rather than with Workbox: three strategies do not need a library.

export interface Store {
  match(key: RequestInfo): Promise<Response | undefined>;
  put(key: RequestInfo, response: Response): Promise<void>;
}

/**
 * The copies of `cache`, matched on their address only: a file copied on install was requested without the Origin
 * header that a module script sends, and a server answering `Vary: Origin` would otherwise make the copy unusable.
 */
export function copiesOf(cache: Pick<Cache, 'match' | 'put'>): Store {
  return {
    match: (key) => cache.match(key, { ignoreVary: true }),
    put: (key, response) => cache.put(key, response),
  };
}

export interface Network {
  cache: Store;
  fetcher: (request: Request) => Promise<Response>;
  /** Keeps the worker alive until a response that arrived too late is stored. */
  keepAlive: (work: Promise<unknown>) => void;
}

/** The key under which the app shell (index.html) is kept: every page of the app is the same file. */
export const shellKey = '/';

/** On a weak network, past this delay the page opens from its copy while the network keeps going. */
export const networkTimeoutMs = 4_000;

const isComplete = (response: Response) => response.status === 200;
const isPage = (response: Response) =>
  isComplete(response) && (response.headers.get('content-type') ?? '').includes('text/html');

async function store(cache: Store, key: RequestInfo, response: Response) {
  try {
    await cache.put(key, response);
  } catch {
    // A full or refused cache only loses the offline copy: the response itself still goes to the page.
  }
}

/**
 * The network's answer when it comes in time, stored for next time; the copy when the network fails or is too
 * slow. Without a copy, the network's answer, however late.
 */
export async function networkFirst(
  request: Request,
  { cache, fetcher, keepAlive }: Network,
  {
    key = request,
    page = false,
    timeoutMs = networkTimeoutMs,
  }: { key?: RequestInfo; page?: boolean; timeoutMs?: number } = {},
): Promise<Response> {
  const network = fetcher(request).then(async (response) => {
    if (page ? isPage(response) : isComplete(response)) await store(cache, key, response.clone());
    return response;
  });
  keepAlive(network.catch(() => undefined));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(resolve, timeoutMs, null);
  });
  try {
    const answer = await Promise.race([network, late]);
    if (answer) return answer;
  } catch (error) {
    const copy = await cache.match(key);
    if (copy) return copy;
    throw error;
  } finally {
    clearTimeout(timer);
  }
  return (await cache.match(key)) ?? network;
}

/** A build file never changes under the same name: its copy, or the network once and then its copy. */
export async function cacheFirst(request: Request, { cache, fetcher }: Network): Promise<Response> {
  const copy = await cache.match(request);
  if (copy) return copy;
  const response = await fetcher(request);
  if (isComplete(response)) await store(cache, request, response.clone());
  return response;
}
