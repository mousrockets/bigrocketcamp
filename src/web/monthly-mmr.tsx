import { useEffect, useRef, useState } from 'react';
import { monthBounds, monthCloseGraceMs, nextMonth, parisMonth } from '../lib/monthly-mmr';
import { apiFetch } from './api';

type MonthlyRow = {
  player: string;
  mmr: number | null;
  recordedAt: string | null;
  confirmedForClose: boolean;
  /** The account the player counts with; absent from months closed before solo accounts counted. */
  account?: 'duo' | 'solo' | null;
};

const accountLabels = { duo: 'compte duo', solo: 'compte solo' } as const;
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
export type MonthlyState = {
  startsMonth: string;
  current: MonthResult;
  closed: MonthResult[];
  allowedPlayers: string[];
  debts: DrinkDebt[];
};

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
function postMonthly(body: Record<string, unknown>) {
  return apiFetch('/api/monthly', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Whether a finished month waits to be closed: only then is the API asked to close it. */
function closeIsDue(data: MonthlyState, now: number = Date.now()): boolean {
  const closed = new Set(data.closed.map((result) => result.month));
  const current = parisMonth(now);
  for (let month = data.startsMonth, step = 0; month < current && step < 24; month = nextMonth(month), step++) {
    if (!closed.has(month) && now >= Date.parse(monthBounds(month).cutoffAt) + monthCloseGraceMs) return true;
  }
  return false;
}

export function MonthlyMmr({ data, onRefresh }: { data: MonthlyState; onRefresh: () => Promise<unknown> }) {
  const latest = useRef(data);
  latest.current = data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const writing = useRef(false);

  // Runs once: asks the API to close a finished month while the page is open, as soon as one is due.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the polling must not restart on every parent refresh.
  useEffect(() => {
    let active = true;
    let running = false;
    const closeDue = async () => {
      if (!active || running || document.hidden || !closeIsDue(latest.current)) return;
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
      setMessage(done);
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  const outstanding = data.debts.filter((debt) => !debt.paidAt);

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
        Le dernier doit <b>une boisson à chacun des autres joueurs</b>, soft ou alcool au choix. Ex æquo à la dernière
        place : aucune dette pour ce mois.
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
                <td>
                  {row.mmr ?? 'Pas encore relevé'}
                  {row.account && <small>{accountLabels[row.account]}</small>}
                </td>
                <td>
                  {row.recordedAt ? (
                    <>
                      {dateLabel(row.recordedAt)}
                      <small>{row.confirmedForClose ? 'Confirmé pour la clôture' : 'À relever le dernier jour'}</small>
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
        Les MMR 2v2 sont relevés automatiquement par la source de rangs du club, sur le compte duo et sur le compte solo
        de chaque joueur. Le résultat retient le meilleur des deux, d’après le dernier relevé de chaque compte avant la
        clôture, qui doit dater du dernier jour du mois ({data.current.lastDay.split('-').reverse().join('/')}) : un
        joueur sans aucun relevé ce jour-là bloque les dettes automatiques du mois.
      </p>
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
      <details className="monthly-history">
        <summary>Bilans mensuels et boissons</summary>
        {!data.closed.length && <p className="small muted">Le premier bilan apparaîtra à la fin de ce mois.</p>}
        {data.closed.map((result) => (
          <article className="monthly-result" key={result.month}>
            <h3>{monthLabel(result.month)}</h3>
            <p>
              {result.status === 'final' ? (
                <>
                  <b>{result.losers?.[0]}</b> termine dernier : une boisson à chacun des autres.
                </>
              ) : result.status === 'tied' ? (
                'Ex æquo à la dernière place : aucune dette.'
              ) : (
                `Pas de dette automatique : MMR de fin de mois manquants pour ${result.missing.join(', ')}.`
              )}
            </p>
            <p className="small muted">Classement arrêté au {dateLabel(result.cutoffAt)}, heure de Paris.</p>
            <p className="small muted">
              {result.rows
                .map(
                  (row) =>
                    `${row.player} : ${row.mmr ?? 'non renseigné'}${row.account ? ` (${accountLabels[row.account]})` : ''}`,
                )
                .join(' · ')}
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
