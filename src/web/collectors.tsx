import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api';
import { errorOf } from './club';
import { Button } from './components/ui/button';

// The Windows collector pairs with a code shown here once; the member sees and revokes their collectors.

interface CollectorDevice {
  id: string;
  created: string;
  lastSeen: string | null;
}

interface Pairing {
  code: string;
  expires: string;
  /** The collectors paired before the code: a new one in the list means the code was used. */
  knownIds: string[];
}

const networkError = (e: unknown) =>
  e instanceof TypeError ? 'Connexion Internet indisponible. Réessaie dans un instant.' : (e as Error).message;

const parisDateTime = (date: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));

const shownCode = (code: string) => `${code.slice(0, 4)} ${code.slice(4)}`;

export function CollectorSection() {
  const [devices, setDevices] = useState<CollectorDevice[]>([]);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const response = await apiFetch('/api/collectors', { cache: 'no-store' });
    if (!response.ok) throw Error(await errorOf(response, 'Liste des collecteurs indisponible.'));
    const list = ((await response.json()) as { devices: CollectorDevice[] }).devices;
    setDevices(list);
    return list;
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(networkError(e)));
  }, [refresh]);

  // While a code is shown, the list follows: the code goes away once used or expired.
  useEffect(() => {
    if (!pairing) return;
    const timer = setInterval(async () => {
      if (Date.parse(pairing.expires) <= Date.now()) {
        setPairing(null);
        return;
      }
      try {
        const list = await refresh();
        if (list.some((device) => !pairing.knownIds.includes(device.id))) setPairing(null);
      } catch {
        // The next tick tries again.
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [pairing, refresh]);

  async function newCode() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch('/api/collectors', { method: 'POST' });
      if (!response.ok) throw Error(await errorOf(response, 'Code impossible à créer.'));
      const { code, expires } = (await response.json()) as { code: string; expires: string };
      setPairing({ code, expires, knownIds: devices.map((device) => device.id) });
    } catch (e) {
      setError(networkError(e));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch('/api/collectors', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!response.ok && response.status !== 404) throw Error(await errorOf(response, 'Révocation impossible.'));
      await refresh();
    } catch (e) {
      setError(networkError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings">
      <h2>Collecteur Windows</h2>
      <p className="muted small">
        Le collecteur envoie tes matchs depuis ton PC, sans navigateur ouvert. Associe-le une fois avec un code ;
        révoque-le si tu changes de PC.
      </p>
      {devices.length > 0 && (
        <ul className="member-list">
          {devices.map((device) => (
            <li key={device.id}>
              <div>
                <strong>Associé le {parisDateTime(device.created)}</strong>
                <p className="small muted">
                  {device.lastSeen
                    ? `Dernier contact le ${parisDateTime(device.lastSeen)}`
                    : 'Aucun contact pour l’instant'}
                </p>
              </div>
              <Button variant="outline" disabled={busy} onClick={() => revoke(device.id)}>
                Révoquer
              </Button>
            </li>
          ))}
        </ul>
      )}
      {pairing ? (
        <div className="settings-panel">
          <p className="small muted">Saisis ce code dans le collecteur :</p>
          <p className="pairing-code">{shownCode(pairing.code)}</p>
          <p className="small muted">
            Valable 10 minutes, une seule fois. Il disparaît dès que le collecteur est associé.
          </p>
        </div>
      ) : (
        <Button variant="outline" disabled={busy} onClick={newCode}>
          Associer le collecteur
        </Button>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
