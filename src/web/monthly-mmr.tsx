import { useEffect, useRef, useState } from 'react';
import { doublesRankOptions } from '../lib/doubles-ranks';
import { apiFetch } from './api';

type MonthlyRow = {
  player: string;
  mmr: number | null;
  recordedAt: string | null;
  confirmedForClose: boolean;
  source?: string;
  sourceUrl?: string | null;
};
type MonthResult = {
  month: string;
  cutoffAt: string;
  lastDay: string;
  rows: MonthlyRow[];
  status: string;
  missing: string[];
  losers?: string[];
  closedAt?: string;
};
type DrinkDebt = {
  id: string;
  month: string;
  payer: string;
  recipient: string;
  paidAt: string | null;
  canSettle: boolean;
  canUndo: boolean;
};
type PublicSync = {
  status: string;
  lastAttempt: string | null;
  nextAttempt: string | null;
  profiles: { player: string; url: string }[];
  errors?: { player: string; error: string }[];
};
export type MonthlyState = {
  startsMonth: string;
  current: MonthResult;
  closed: MonthResult[];
  allowedPlayers: string[];
  debts: DrinkDebt[];
  publicSync?: PublicSync;
};
type Pending = { id: string; player: string; mmr: number; tier: number | null; division: number | null };

const pendingKey = 'rl-monthly-mmr-pending';
const divisions = ['I', 'II', 'III', 'IV'];

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', month: 'long', year: 'numeric' }).format(
    new Date(`${month}-15T12:00:00Z`),
  );
// Bronze to Grand Champion have divisions; unranked (0) and Supersonic Legend (22) do not.
const hasDivisions = (tier: string) => tier !== '' && Number(tier) > 0 && Number(tier) < 22;

function forgetPending() {
  try {
    localStorage.removeItem(pendingKey);
  } catch {
    // Without storage, the pending entry simply lives until the page closes.
  }
}

function postMonthly(body: Record<string, unknown>) {
  return apiFetch('/api/monthly', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function MonthlyMmr({ data, onRefresh }: { data: MonthlyState; onRefresh: () => Promise<unknown> }) {
  const [player, setPlayer] = useState(data.allowedPlayers[0] || '');
  const [mmr, setMmr] = useState('');
  const [tier, setTier] = useState('');
  const [division, setDivision] = useState('1');
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const writing = useRef(false);

  // Runs once: restores an unconfirmed entry, then asks the API to close a finished month while the page is open.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the polling must not restart on every parent refresh.
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(pendingKey) || 'null') as Pending | null;
      if (raw?.id && data.allowedPlayers.includes(raw.player)) {
        setPending(raw);
        setPlayer(raw.player);
        setMmr(String(raw.mmr));
        setTier(raw.tier === null ? '' : String(raw.tier));
        setDivision(String(raw.division || 1));
      }
    } catch {
      // A missing or corrupted entry only means there is nothing to retry.
    }
    let active = true;
    let running = false;
    const closeDue = async () => {
      if (!active || running || document.hidden) return;
      running = true;
      try {
        const response = await postMonthly({ action: 'refresh' });
        const result = response.ok ? ((await response.json()) as { closed?: number }) : null;
        if (active && result?.closed) await onRefresh();
      } catch {
        // The next tick retries; closing the month is also done by the server.
      } finally {
        running = false;
      }
    };
    closeDue();
    const timer = setInterval(closeDue, 60000);
    document.addEventListener('visibilitychange', closeDue);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', closeDue);
    };
  }, []);

  async function action(body: Record<string, unknown>, done: string) {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await postMonthly(body);
      const result = (await response.json()) as { error?: string; ok?: boolean };
      if (!response.ok || !result.ok) throw Error(result.error || 'Action impossible.');
      if (body.action === 'record') {
        setPending(null);
        forgetPending();
        setMmr('');
      }
      setMessage(done);
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  function submit() {
    if (writing.current) return;
    const selectedTier = tier === '' ? null : Number(tier);
    // The same id is resent until the server confirms, so a retry never records twice.
    const value = pending || {
      id: crypto.randomUUID(),
      player,
      mmr: Number(mmr),
      tier: selectedTier,
      division: hasDivisions(tier) ? Number(division) : null,
    };
    setPending(value);
    try {
      localStorage.setItem(pendingKey, JSON.stringify(value));
    } catch {
      // Storage is only a safety net for retries after a reload.
    }
    action(
      { action: 'record', ...value },
      'MMR 2v2 enregistré. Il faudra le confirmer après tes dernières parties du dernier jour du mois.',
    );
  }

  function editEntry() {
    setPending(null);
    setError('');
    forgetPending();
    setMessage('Nouvelle saisie possible. Si l’envoi précédent avait abouti, son relevé reste dans le classement.');
  }

  const outstanding = data.debts.filter((debt) => !debt.paidAt);
  const locked = busy || !!pending;

  return (
    <section id="monthly-mmr" className="monthly-mmr" aria-labelledby="monthly-mmr-title">
      <div className="section-title">
        <div>
          <p className="eyebrow">LE DÉFI DU MOIS · 2V2</p>
          <h2 id="monthly-mmr-title">Classement MMR de {monthLabel(data.current.month)}</h2>
        </div>
        <span className="pill">
          {outstanding.length} boisson{outstanding.length > 1 ? 's' : ''} à offrir
        </span>
      </div>
      <p className="monthly-rule">
        Le dernier doit <b>une boisson à chacun des deux autres joueurs</b>, soft ou alcool au choix. Ex æquo à la
        dernière place : aucune dette pour ce mois.
      </p>
      <p className="small muted">
        Clôture le <b>{dateLabel(data.current.cutoffAt)}</b>, heure de Paris. Le classement reste provisoire jusque-là ;
        le bilan est archivé quelques minutes après.
      </p>
      <div className="table-wrap">
        <table aria-label="Classement MMR mensuel">
          <thead>
            <tr>
              <th>Joueur</th>
              <th>MMR 2v2</th>
              <th>Dernier relevé</th>
            </tr>
          </thead>
          <tbody>
            {data.current.rows.map((row) => (
              <tr key={row.player}>
                <td>
                  <b>{row.player}</b>
                </td>
                <td>{row.mmr ?? 'À renseigner'}</td>
                <td>
                  {row.recordedAt ? (
                    <>
                      {dateLabel(row.recordedAt)}
                      <small>
                        {row.source === 'rlstats' ? (
                          <a href={row.sourceUrl || undefined} target="_blank" rel="noopener noreferrer">
                            RLStats.net · profil public ↗
                          </a>
                        ) : (
                          'Déclaration du joueur'
                        )}
                      </small>
                      <small>
                        {row.confirmedForClose
                          ? 'Confirmé pour la clôture'
                          : row.source === 'rlstats'
                            ? 'Nouveau relevé prévu en fin de mois'
                            : 'À confirmer le dernier jour'}
                      </small>
                    </>
                  ) : (
                    'Aucun relevé de ce mois'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        Les MMR 2v2 sont relevés sur les profils publics RLStats.net le dernier jour du mois (
        {data.current.lastDay.split('-').reverse().join('/')}) à 23 h 59, heure de Paris. Aucune connexion à vos comptes
        Epic ni logiciel à laisser tourner. Le résultat utilise les derniers relevés reçus avant la clôture ; la date
        affichée est celle de la source.
      </p>
      <p className="small muted">
        Les trois relevés publics doivent dater des 15 dernières minutes du mois. S’il manque une valeur récente, aucune
        dette automatique ne sera créée. Tu peux aussi confirmer ton propre MMR manuellement après tes dernières parties
        du dernier jour. Les anciennes valeurs figées ne décident pas du résultat.
      </p>
      {data.publicSync && (
        <div className="public-mmr-source">
          <p className="small muted">
            Profils suivis :{' '}
            {data.publicSync.profiles.map((profile, index) => (
              <span key={profile.player}>
                {index > 0 ? ' · ' : ''}
                <a href={profile.url} target="_blank" rel="noopener noreferrer">
                  {profile.player} ↗
                </a>
              </span>
            ))}
            . Si tu changes de pseudo sur cette plateforme, signale-le pour mettre à jour le profil suivi.
          </p>
          {data.publicSync.lastAttempt && (
            <p className="small muted">Dernière tentative : {dateLabel(data.publicSync.lastAttempt)}.</p>
          )}
          {data.publicSync.errors?.map((syncError) => (
            <p className="small muted" key={syncError.player}>
              {syncError.player} : {syncError.error} Dernière valeur conservée.
            </p>
          ))}
          <p className="small muted">
            L’agent consulte les pages publiques puis enregistre les relevés ; le site ne se connecte pas à vos comptes.
          </p>
        </div>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {data.allowedPlayers.length > 0 ? (
        <details>
          <summary className="small muted">Saisir ou confirmer mon MMR manuellement</summary>
          <form
            aria-label="Déclarer mon MMR 2v2"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="monthly-fields">
              <label>
                Mon joueur
                <select value={player} disabled={locked} onChange={(event) => setPlayer(event.target.value)}>
                  {data.allowedPlayers.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label>
                MMR 2v2 actuel
                <input
                  type="number"
                  required
                  min={0}
                  max={10000}
                  step={1}
                  value={mmr}
                  disabled={locked}
                  onChange={(event) => setMmr(event.target.value)}
                />
              </label>
            </div>
            <details>
              <summary className="small muted">Préciser le rang et la division (facultatif)</summary>
              <div className="monthly-fields">
                <label>
                  Rang
                  <select value={tier} disabled={locked} onChange={(event) => setTier(event.target.value)}>
                    <option value="">Non renseigné</option>
                    {doublesRankOptions.map((rank) => (
                      <option key={rank.tier} value={rank.tier}>
                        {rank.label}
                      </option>
                    ))}
                  </select>
                </label>
                {hasDivisions(tier) && (
                  <label>
                    Division
                    <select value={division} disabled={locked} onChange={(event) => setDivision(event.target.value)}>
                      {divisions.map((label, index) => (
                        <option key={label} value={index + 1}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </details>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Enregistrement…' : pending ? 'Réessayer le même envoi' : 'Enregistrer mon MMR'}
            </button>
            {pending && (
              <button type="button" disabled={busy} onClick={editEntry}>
                Modifier la saisie
              </button>
            )}
          </form>
        </details>
      ) : (
        <p className="small muted">
          Pour déclarer ton MMR, utilise le compte associé à <a href="/connexions">ton identité de joueur</a>.
        </p>
      )}
      <details className="monthly-history">
        <summary>Bilans mensuels et boissons</summary>
        {!data.closed.length && <p className="small muted">Le premier bilan apparaîtra à la fin de ce mois.</p>}
        {data.closed.map((result) => (
          <article className="monthly-result" key={result.month}>
            <h3>{monthLabel(result.month)}</h3>
            <p>
              {result.status === 'final' ? (
                <>
                  <b>{result.losers?.[0]}</b> termine dernier : une boisson à chacun des deux autres.
                </>
              ) : result.status === 'tied' ? (
                'Ex æquo à la dernière place : aucune dette.'
              ) : (
                `Pas de dette automatique : MMR de fin de mois manquants pour ${result.missing.join(', ')}.`
              )}
            </p>
            <p className="small muted">Classement arrêté au {dateLabel(result.cutoffAt)}, heure de Paris.</p>
            <p className="small muted">
              {result.rows.map((row) => `${row.player} : ${row.mmr ?? 'non renseigné'}`).join(' · ')}
            </p>
            {data.debts
              .filter((debt) => debt.month === result.month)
              .map((debt) => (
                <div className="drink-debt" key={debt.id}>
                  <span>
                    <b>{debt.payer}</b> → {debt.recipient}
                    <small>1 boisson · {debt.paidAt ? `Offerte le ${dateLabel(debt.paidAt)}` : 'À offrir'}</small>
                  </span>
                  {!debt.paidAt && debt.canSettle && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => action({ action: 'settle', id: debt.id }, 'Boisson marquée comme offerte.')}
                    >
                      Boisson offerte
                    </button>
                  )}
                  {debt.paidAt && debt.canUndo && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => action({ action: 'undo', id: debt.id }, 'Paiement annulé.')}
                    >
                      Annuler
                    </button>
                  )}
                </div>
              ))}
          </article>
        ))}
      </details>
    </section>
  );
}
