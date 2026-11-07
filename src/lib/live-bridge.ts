import { checkLiveMatch, type LivePayload, matchCapture, statsStream } from './live-stats';
import { defaultTimeoutMs, fetchWithin } from './timeout';

const queueKey = 'rl-live-queue-v1';
const gameSocket = 'ws://localhost:49124/';

export interface LiveStatus {
  active?: boolean;
  queued?: number;
  connection?: string;
  message?: string;
  lastReceived?: number;
}

interface SocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  close(): void;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// The bridge runs in the browser; reading these through globalThis keeps it testable and DOM-free.
const browser = globalThis as unknown as {
  WebSocket: new (url: string) => SocketLike;
  localStorage?: StorageLike;
};

interface BridgeOptions {
  WebSocketType?: new (url: string) => SocketLike;
  fetcher?: typeof fetch;
  storage?: StorageLike | undefined;
  onStatus?: (patch: LiveStatus) => void;
  schedule?: (callback: () => void, delay: number) => unknown;
  cancel?: (handle: unknown) => void;
  now?: () => number;
  /** How long a send may take before it is given up and retried. */
  timeoutMs?: number;
}

/** Reads final scoreboards and matches left from the game on this PC and sends them to the API, keeping them while offline. */
export function liveBridge({
  WebSocketType = browser.WebSocket,
  fetcher = globalThis.fetch,
  storage = browser.localStorage,
  onStatus = () => {},
  schedule = setTimeout as unknown as (callback: () => void, delay: number) => unknown,
  cancel = clearTimeout as unknown as (handle: unknown) => void,
  now = Date.now,
  timeoutMs = defaultTimeoutMs,
}: BridgeOptions = {}) {
  let queue: LivePayload[] = [];
  let active = false;
  let socket: SocketLike | null = null;
  let retry: unknown = null;
  let uploadRetry: unknown = null;
  let sending = false;
  let backoff = 1000;

  const persist = () => {
    try {
      storage?.setItem(queueKey, JSON.stringify(queue));
    } catch {
      onStatus({ message: 'Stockage local indisponible : garde cet onglet ouvert jusqu’à l’envoi.' });
    }
    onStatus({ queued: queue.length });
  };

  try {
    const saved = JSON.parse(storage?.getItem(queueKey) || '[]');
    if (Array.isArray(saved)) {
      queue = saved.slice(-20).filter((payload) => {
        try {
          checkLiveMatch(payload, now());
          return true;
        } catch {
          return false;
        }
      });
    }
  } catch {
    // A corrupted saved queue is dropped: the matches it held are older than a day anyway.
  }

  const stream = statsStream();
  const capture = matchCapture((payload) => {
    const existing = queue.findIndex((queued) => queued.state.MatchGuid === payload.state.MatchGuid);
    if (existing >= 0) queue[existing] = payload;
    else queue.push(payload);
    if (queue.length > 20) {
      queue.shift();
      onStatus({ message: 'Plus de 20 matchs en attente : le plus ancien n’a pas pu être envoyé.' });
    }
    persist();
    void upload();
  }, now);

  function laterUpload() {
    if (active && !uploadRetry) {
      uploadRetry = schedule(() => {
        uploadRetry = null;
        void upload();
      }, 10_000);
    }
  }

  async function upload() {
    if (!active || sending || !queue.length) return;
    sending = true;
    try {
      while (active && queue.length) {
        const payload = queue[0] as LivePayload;
        try {
          checkLiveMatch(payload, now());
        } catch {
          queue.shift();
          persist();
          onStatus({ message: 'Un match trop ancien n’a pas pu être envoyé.' });
          continue;
        }
        let response: Response;
        try {
          // A send that never answers would hold every later match: it is given up, then retried.
          response = await fetchWithin(
            fetcher,
            '/api/live',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            },
            timeoutMs,
          );
        } catch {
          onStatus({ message: 'Envoi en attente de connexion Internet.' });
          laterUpload();
          break;
        }
        if (!response.ok) {
          let error: string | undefined;
          try {
            error = ((await response.json()) as { error?: string }).error;
          } catch {
            // The error message is optional.
          }
          onStatus({ message: error || 'Envoi indisponible : nouvelle tentative automatique.' });
          // A refused scoreboard will never be accepted: drop it instead of retrying forever.
          if (response.status === 400 || response.status === 413) {
            if (queue[0] === payload) queue.shift();
            persist();
            continue;
          }
          laterUpload();
          break;
        }
        let receipt: { ok?: unknown; match?: unknown } | undefined;
        try {
          receipt = await response.json();
        } catch {
          // Checked just below.
        }
        if (receipt?.ok !== true || receipt.match !== payload.state.MatchGuid.trim().toLowerCase()) {
          onStatus({ message: 'Réception non confirmée : reconnecte-toi au site. Le match reste en attente.' });
          laterUpload();
          break;
        }
        if (queue[0] === payload) queue.shift();
        persist();
        onStatus({
          lastReceived: now(),
          message: 'Match reçu par RL-Pompes. Le tableau du club se met à jour automatiquement.',
        });
      }
    } finally {
      sending = false;
    }
  }

  function connect() {
    if (!active || socket) return;
    try {
      socket = new WebSocketType(gameSocket);
    } catch {
      onStatus({ connection: 'Connexion locale refusée : vérifie les réglages et l’autorisation réseau local.' });
      reconnect();
      return;
    }
    const current = socket;
    current.onopen = () => {
      if (!active || socket !== current) return;
      backoff = 1000;
      onStatus({ connection: 'Connecté au jeu · en attente d’une nouvelle partie.' });
    };
    current.onmessage = (event) => {
      if (!active || socket !== current) return;
      try {
        for (const packet of stream.push(event.data)) capture.handle(packet);
      } catch (error) {
        stream.reset();
        capture.reset();
        onStatus({
          message: (error as Error).message || 'Message local illisible : en attente de la prochaine partie.',
        });
      }
    };
    current.onerror = () => {
      if (active && socket === current) {
        onStatus({
          connection:
            'Jeu inaccessible : vérifie la configuration, le lancement du jeu et l’autorisation réseau local.',
        });
      }
    };
    current.onclose = () => {
      if (socket !== current) return;
      socket = null;
      stream.reset();
      capture.reset();
      if (active) {
        onStatus({ connection: 'En attente de Rocket League ou de la connexion locale.' });
        reconnect();
      }
    };
  }

  function reconnect() {
    if (active && !retry) {
      const delay = backoff;
      backoff = Math.min(30_000, backoff * 2);
      retry = schedule(() => {
        retry = null;
        connect();
      }, delay);
    }
  }

  return {
    start() {
      if (active) return;
      active = true;
      onStatus({ active: true, queued: queue.length, connection: 'Connexion au jeu sur ce PC…' });
      connect();
      void upload();
    },
    stop() {
      active = false;
      cancel(retry);
      cancel(uploadRetry);
      retry = null;
      uploadRetry = null;
      const current = socket;
      socket = null;
      current?.close();
      stream.reset();
      capture.reset();
      onStatus({ active: false, connection: 'Direct arrêté sur cet appareil.' });
    },
    retry() {
      void upload();
    },
  };
}
