import { useEffect, useState } from 'react';
import { apiFetch } from './api';
import { Brand } from './brand';

type Alias = { playerId: string; primary: boolean };
type Identity = { slot: string; known: boolean; owned: boolean; aliases: Alias[] };
type Candidate = { playerId: string; name: string; day: string };

// "platform|id": the platform and the end of the id are enough to recognise one's own account.
function shortId(id: string) {
  const [platform = '', accountId = ''] = id.split('|');
  return `${platform} · …${accountId.slice(-6)}`;
}

export function Connections() {
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function refresh() {
    try {
      const response = await apiFetch('/api/identities');
      if (!response.ok) throw Error('Connexion au club requise.');
      const data = (await response.json()) as { identities: Identity[]; candidates: Candidate[] };
      setIdentities(data.identities);
      setCandidates(data.candidates);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: loads the page once.
  useEffect(() => {
    try {
      // Leftover of the retired Epic sign-in flow.
      sessionStorage.removeItem('rl-epic-pending-public');
    } catch {
      // Nothing to clean without storage.
    }
    refresh();
  }, []);

  async function act(slot: string, playerId: string | undefined, action = 'confirm') {
    if (busy || !playerId) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch('/api/identities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot, playerId, action }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(result.error || 'Confirmation impossible.');
      setMessage(
        action === 'remove'
          ? 'Identifiant supplémentaire retiré.'
          : 'Identifiant confirmé. Les tableaux du Direct utiliseront cette identité.',
      );
      await refresh();
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
        <a className="back-link" href="/">
          ← Retour au tableau
        </a>
      </header>
      <section>
        <p className="eyebrow">SCORES LOCAUX · AUCUN ACCÈS EPIC</p>
        <h1>Nos joueurs</h1>
        <p className="muted">
          La connexion communautaire Epic est retirée. Les identifiants de jeu sont conservés pour reconnaître vos
          tableaux du Direct, sans mot de passe ni jeton Epic.
        </p>
        <a href="/direct">Configurer le Direct PC →</a>
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
              {identity.known ? 'Identité de jeu enregistrée' : 'Identité à associer avec l’administrateur du club'}
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
      <section className="daily-recap">
        <h2>Les anciennes autorisations Epic</h2>
        <p className="muted">
          Les copies conservées par cette application sont supprimées. Cela ne révoque pas automatiquement les
          autorisations chez Epic. Pour éviter d’interrompre une partie, aucune déconnexion générale n’est lancée ici.
        </p>
        <p className="small muted">
          Lorsque vous aurez fermé Rocket League, vous pourrez gérer les autorisations dans les paramètres Epic, onglet
          Applications. Ne confondez pas une autorisation d’application avec la liaison de votre compte PlayStation.
        </p>
        <a href="https://www.epicgames.com/account/connections#apps" target="_blank" rel="noopener noreferrer">
          Gérer les autorisations chez Epic ↗
        </a>
      </section>
    </main>
  );
}
