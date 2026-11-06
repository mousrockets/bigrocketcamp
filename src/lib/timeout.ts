// A request that never answers (a half-dead connection, a computer waking up) must not freeze the page:
// every call to the API gives up after a while, and the caller's own retry takes over.

/** How long a call to the API may take, unless the caller says otherwise. */
export const defaultTimeoutMs = 15_000;

export const timeoutMessage = 'Le serveur ne répond pas. Vérifie ta connexion : la page réessaie toute seule.';

/** Aborts after `ms`, or as soon as `signal` does (written by hand: older browsers lack AbortSignal.any). */
export function timeoutSignal(ms: number, signal?: AbortSignal | null): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException(timeoutMessage, 'TimeoutError')), ms);
  const stop = () => {
    clearTimeout(timer);
    controller.abort(signal?.reason);
  };
  if (signal?.aborted) stop();
  else signal?.addEventListener('abort', stop, { once: true });
  return controller.signal;
}

/** `fetch`, given up after `ms`; a request given up rejects with a French message. */
export async function fetchWithin(
  fetcher: typeof fetch,
  input: string,
  init: RequestInit = {},
  ms: number = defaultTimeoutMs,
): Promise<Response> {
  const signal = timeoutSignal(ms, init.signal);
  try {
    return await fetcher(input, { ...init, signal });
  } catch (error) {
    // The caller's own abort stays an abort; only the timeout becomes a message for the member.
    if (signal.aborted && !init.signal?.aborted) throw new Error(timeoutMessage);
    throw error;
  }
}
