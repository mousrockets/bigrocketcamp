import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { ChevronRightIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatNumber } from '../../lib/domain';
import { useBoardState } from '../board/board-context';
import type { MonthlyState } from '../board/monthly';
import { Note, PageGlow, PageHeader, Panel } from '../components/club/page';
import { SeasonCountdown } from '../components/club/season-countdown';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';

// The month's 2v2 MMR challenge: how long before the close, the provisional ranking, and the rule.

const monthName = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', month: 'long' });
const closeDay = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' });
const closeTime = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
const readAt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
/** "le 30 novembre à minuit", or the time when the close is not at midnight. */
function closingLabel(cutoff: Date): string {
  const time = closeTime.format(cutoff);
  if (time === '00:00') return `le ${closeDay.format(new Date(cutoff.getTime() - 60_000))} à minuit`;
  return `le ${closeDay.format(cutoff)} à ${time.replace(':', ' h ')}`;
}
const accountLabels = { duo: 'Compte duo', solo: 'Compte solo' } as const;
const twoDigits = (value: number) => String(value).padStart(2, '0');

export const monthOf = (month: string) => monthName.format(new Date(`${month}-15T12:00:00Z`));

function useNow(everyMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

function Countdown({ cutoffAt }: { cutoffAt: string }) {
  const now = useNow(30_000);
  const left = Math.max(0, Date.parse(cutoffAt) - now);
  const parts: [string, string][] = [
    [String(Math.floor(left / 86_400_000)), 'Jours'],
    [twoDigits(Math.floor((left % 86_400_000) / 3_600_000)), 'Heures'],
    [twoDigits(Math.floor((left % 3_600_000) / 60_000)), 'Min'],
  ];
  return (
    <Panel aria-label="Avant la clôture" className="grid grid-cols-3">
      {parts.map(([value, label], index) => (
        <div
          key={label}
          className={cn('flex flex-col items-center gap-0.5 py-3.5', index === 1 && 'border-x border-border')}
        >
          <b className="font-numeral text-[52px] leading-[0.9]">{value}</b>
          <span className="kicker">{label}</span>
        </div>
      ))}
    </Panel>
  );
}

function Ranking({ monthly, me }: { monthly: MonthlyState; me: string | null }) {
  const rows = [...monthly.current.rows].sort((a, b) => (b.mmr ?? -1) - (a.mmr ?? -1));
  const complete = rows.length > 1 && rows.every((row) => row.mmr !== null);
  return (
    <Panel aria-label="Classement MMR provisoire">
      <ol>
        {rows.map((row, index) => {
          const last = complete && index === rows.length - 1;
          const detail = [
            row.account ? accountLabels[row.account] : '',
            row.recordedAt ? `relevé le ${readAt.format(new Date(row.recordedAt))}` : 'aucun relevé ce mois',
            row.recordedAt ? (row.confirmedForClose ? 'confirmé pour la clôture' : '') : '',
            last ? 'dernier à ce jour' : '',
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <li
              key={row.player}
              className={cn(
                'grid grid-cols-[24px_1fr_auto] items-center gap-3 border-t border-border px-4 py-3.5 first:border-t-0',
                row.player === me && 'bg-primary/7',
              )}
            >
              <span className={cn('font-numeral text-[22px]', last ? 'text-cost' : 'text-muted-foreground')}>
                {index + 1}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <b className="text-[15px] font-semibold">
                  {row.player}
                  {row.player === me && (
                    <Badge variant="me" className="ml-1 align-middle">
                      Toi
                    </Badge>
                  )}
                </b>
                <small
                  className={cn('text-xs first-letter:uppercase', last ? 'text-cost-soft' : 'text-muted-foreground')}
                >
                  {detail}
                </small>
              </span>
              <b className="font-numeral text-[26px]">{row.mmr !== null ? formatNumber(row.mmr) : '—'}</b>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

export function ChallengePage() {
  const { data, me } = useBoardState();
  const monthly = data?.monthly;
  const outstanding = monthly?.debts.filter((debt) => !debt.paidAt).length ?? 0;
  const cutoff = monthly ? new Date(monthly.current.cutoffAt) : null;
  return (
    <>
      <PageGlow tone="cost" />
      <PageHeader
        className="relative"
        kicker="Le défi du mois · 2v2"
        title={monthly ? `Classement de ${monthOf(monthly.current.month)}` : 'Défi du mois'}
        actions={
          outstanding > 0 && (
            <Badge variant="pill">
              {outstanding} boisson{outstanding > 1 ? 's' : ''} à offrir
            </Badge>
          )
        }
      />
      {!data ? (
        <Skeleton className="h-[400px] rounded-card" />
      ) : !monthly ? (
        <p className="text-sm text-muted-foreground">Le défi du mois n’est pas encore disponible sur ce club.</p>
      ) : (
        <div className="relative flex flex-col gap-3.5 lg:grid lg:grid-cols-[1.4fr_1fr] lg:items-start lg:gap-x-5 lg:gap-y-3.5">
          <div className="lg:col-start-2 lg:row-start-1">
            <Countdown cutoffAt={monthly.current.cutoffAt} />
          </div>
          {cutoff && (
            <Note className="-mt-1 lg:col-start-2 lg:row-start-2 lg:mt-0">
              Clôture {closingLabel(cutoff)}, heure de Paris. Le classement reste provisoire jusque-là ; le bilan est
              archivé quelques minutes après.
            </Note>
          )}
          <div className="lg:col-start-1 lg:row-span-3 lg:row-start-1">
            <Ranking monthly={monthly} me={me} />
          </div>
          <Panel aria-label="La règle" className="gap-2 p-4 lg:col-start-1 lg:row-span-2 lg:row-start-4">
            <h2 className="font-display text-lg">La règle</h2>
            <p className="text-sm leading-[1.45] text-soft">
              Le dernier doit une boisson à chacun des autres joueurs, soft ou alcool au choix. Ex æquo à la dernière
              place : aucune dette.
            </p>
            <p className="text-xs leading-[1.45] text-muted-foreground">
              Le meilleur MMR 2v2 de chaque joueur, entre son compte duo et son compte solo, relevé automatiquement par
              la source de rangs du club. Le dernier relevé avant la clôture doit dater du dernier jour du mois (
              {monthly.current.lastDay.split('-').reverse().join('/')}) : un joueur sans relevé ce jour-là bloque les
              dettes automatiques du mois.
            </p>
          </Panel>
          <nav
            aria-label="Plus sur le défi"
            className="overflow-hidden rounded-card border border-border bg-card lg:col-start-2 lg:row-start-3"
          >
            {(
              [
                ['/defi/bilans', 'Bilans et boissons'],
                ['/defi/podium', 'Podium de la semaine'],
              ] as const
            ).map(([to, label]) => (
              <Link
                key={to}
                to={to}
                className="flex min-h-11 items-center justify-between border-t border-border px-4 py-3.5 text-[15px] font-semibold text-foreground no-underline first:border-t-0 hover:bg-accent/60 hover:no-underline"
              >
                {label}
                <ChevronRightIcon aria-hidden="true" className="size-[18px] text-muted-foreground" />
              </Link>
            ))}
          </nav>
          <div className="lg:col-start-2 lg:row-start-4">
            <SeasonCountdown />
          </div>
        </div>
      )}
    </>
  );
}
