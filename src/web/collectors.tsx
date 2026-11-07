import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from './components/ui/button';
import { collectorsQuery } from './queries';
import { createPairingCode, revokeCollector } from './writes';

// The Windows collector pairs with a code shown here once; the member sees and revokes their collectors.

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
  const queryClient = useQueryClient();
  const { data, error: readError, refetch } = useQuery(collectorsQuery);
  const devices = data ?? [];
  const newPairingCode = useMutation({ mutationFn: createPairingCode }).mutateAsync;
  const revokeDevice = useMutation({ mutationFn: revokeCollector }).mutateAsync;
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Only a list never read says it failed: while a code is shown, the next tick simply tries again.
  const unread = data === undefined ? readError : null;
  useEffect(() => {
    if (unread) setError(networkError(unread));
  }, [unread]);

  // While a code is shown, the list follows: the code goes away once used or expired.
  useEffect(() => {
    if (!pairing) return;
    const timer = setInterval(async () => {
      if (Date.parse(pairing.expires) <= Date.now()) {
        setPairing(null);
        return;
      }
      const { data: list } = await refetch();
      if (list?.some((device) => !pairing.knownIds.includes(device.id))) setPairing(null);
    }, 4000);
    return () => clearInterval(timer);
  }, [pairing, refetch]);

  async function newCode() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { code, expires } = await newPairingCode();
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
      await revokeDevice(id);
      await queryClient.fetchQuery({ ...collectorsQuery, staleTime: 0 });
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
