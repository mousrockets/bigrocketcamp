import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Brand } from './brand';
import { ApiError, identitiesQuery } from './queries';
import { changeIdentity, type IdentityChange } from './writes';

/** This page's wording of a failed read of the identities. */
const loadError = (e: Error) => (e instanceof ApiError ? 'Connexion au club requise.' : e.message);

// "platform|id": the platform and the end of the id are enough to recognise one's own account.
export function shortId(id: string) {
  const [platform = '', accountId = ''] = id.split('|');
  return `${platform} · …${accountId.slice(-6)}`;
}

export function Connections() {
  const queryClient = useQueryClient();
  const { data, error: readError } = useQuery(identitiesQuery);
  const identities = data?.identities ?? [];
  const candidates = data?.candidates ?? [];
  const change = useMutation({ mutationFn: changeIdentity }).mutateAsync;
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (readError) setError(loadError(readError));
  }, [readError]);

  async function act(slot: string, playerId: string | undefined, action: IdentityChange['action'] = 'confirm') {
    if (busy || !playerId) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await change({ slot, playerId, action });
      setMessage(
        action === 'remove'
          ? 'Identifiant supplémentaire retiré.'
          : 'Identifiant confirmé. Les tableaux du Direct utiliseront cette identité.',
      );
      await queryClient.refetchQueries(identitiesQuery);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header>
        <Brand />
        <Link className="back-link" to="/" reloadDocument>
          ← Retour au tableau
        </Link>
      </header>
      <section>
        <p className="eyebrow">IDENTITÉS DE JEU</p>
        <h1>Nos joueurs</h1>
        <p className="muted">
          Chaque joueur confirme son identifiant de jeu à partir d’un tableau reçu : c’est lui qui rattache les tableaux
          du Direct au bon joueur.
        </p>
        <Link to="/direct" reloadDocument>
          Configurer le Direct PC →
        </Link>
      </section>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <section className="connection-list">
        {identities.map((identity) => (
          <article className="card" key={identity.slot}>
            <h2>{identity.slot}</h2>
            <p>
              {identity.known
                ? 'Identité de jeu enregistrée'
                : identity.owned
                  ? 'Pas encore d’identité de jeu : choisis ton joueur dans un tableau reçu.'
                  : 'Identité à associer avec l’administrateur du club'}
            </p>
            {identity.owned && <p className="small muted">Ton joueur sur ce compte</p>}
            <ul>
              {identity.aliases.map((alias) => (
                <li key={alias.playerId}>
                  {shortId(alias.playerId)}{' '}
                  {identity.owned && !alias.primary && (
                    <button type="button" disabled={busy} onClick={() => act(identity.slot, alias.playerId, 'remove')}>
                      Retirer cet identifiant
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {identity.owned && (
              <>
                <p className="small muted">
                  Pour une console, choisis ton propre joueur dans un tableau déjà reçu. Confirme uniquement ton compte
                  : un pseudo seul n’est pas une preuve d’identité.
                </p>
                <label>
                  Mon joueur dans le tableau
                  <select
                    aria-label={`Identifiant de ${identity.slot}`}
                    value={choices[identity.slot] || ''}
                    disabled={busy}
                    onChange={(event) =>
                      setChoices((previous) => ({ ...previous, [identity.slot]: event.target.value }))
                    }
                  >
                    <option value="">Choisir mon joueur…</option>
                    {candidates.map((candidate) => (
                      <option key={candidate.playerId} value={candidate.playerId}>
                        {candidate.name} · {shortId(candidate.playerId)} · {candidate.day}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busy || !choices[identity.slot]}
                  onClick={() => act(identity.slot, choices[identity.slot])}
                >
                  Confirmer mon identifiant
                </button>
              </>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
