import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { useEffect, useId, useState } from 'react';
import { formatNumber } from '../../lib/domain';
import { useBoardState } from '../board/board-context';
import type { MonthlyState } from '../board/monthly';
import { DrinkButton, DrinkTile, useDrinkActions } from '../components/club/drink-parts';
import { PageHeader, Panel } from '../components/club/page';
import { PlayerAvatar } from '../components/club/player-avatar';
import { SeasonCountdown } from '../components/club/season-countdown';
import { Segmented } from '../components/club/segmented';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { closingLabel, monthSummary, readingLabel } from './challenge-copy';
import { PodiumSteps, usePodium } from './podium';

// The month's 2v2 MMR challenge. On a phone: how long before the close, the provisional ranking, the rule, and the
// way to the drinks and the podium. On a wide screen, all on one page: the podium and the drinks beside them.

const accountLabels = { duo: 'Compte duo', solo: 'Compte solo' } as const;
const twoDigits = (value: number) => String(value).padStart(2, '0');

function useNow(everyMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

/** The days, hours and minutes left; on a wide screen, the close and the rule in a fourth cell. */
function Countdown({ cutoffAt, wide = false }: { cutoffAt: string; wide?: boolean }) {
  const now = useNow(30_000);
  const left = Math.max(0, Date.parse(cutoffAt) - now);
  const parts: [string, string][] = [
    [String(Math.floor(left / 86_400_000)), 'Jours'],
    [twoDigits(Math.floor((left % 86_400_000) / 3_600_000)), 'Heures'],
    [twoDigits(Math.floor((left % 3_600_000) / 60_000)), 'Min'],
  ];
  return (
    <Panel aria-label="Avant la clôture" className={wide ? 'flex-row flex-wrap' : 'grid grid-cols-3'}>
      {parts.map(([value, label], index) => (
        <div
          key={label}
          className={cn(
            'flex flex-col items-center gap-0.5',
            wide ? 'box-content flex-[1_1_90px] py-4' : 'py-3.5',
            wide ? index > 0 && 'border-l border-border' : index === 1 && 'border-x border-border',
          )}
        >
          <b className={cn('font-numeral', wide ? 'text-[56px]' : 'text-[52px]', 'leading-[0.9]')}>{value}</b>
          <span className="kicker">{label}</span>
        </div>
      ))}
      {wide && (
        <div className="box-content flex flex-[2_1_220px] flex-col justify-center gap-1 border-l border-border px-5 py-4 text-[13px] text-muted-foreground">
          Clôture {closingLabel(cutoffAt)}, heure de Paris.
          <span className="text-soft">
            Le dernier paie un verre à chacun. Ex æquo : tout le monde garde son porte-monnaie.
          </span>
        </div>
      )}
    </Panel>
  );
}

/** The month's ranking so far: the member's row in blue, the last in orange once every player has a rating. */
function Ranking({ monthly, me, wide = false }: { monthly: MonthlyState; me: string | null; wide?: boolean }) {
  const now = useNow(60_000);
  const rows = [...monthly.current.rows].sort((a, b) => (b.mmr ?? -1) - (a.mmr ?? -1));
  const complete = rows.length > 1 && rows.every((row) => row.mmr !== null);
  return (
    <Panel aria-label="Classement MMR provisoire" className="overflow-hidden">
      {wide && (
        <div className="flex items-baseline justify-between px-5 pt-4 pb-2.5">
          <h2 className="font-display text-xl">Classement provisoire</h2>
          <span className="kicker">MMR 2v2</span>
        </div>
      )}
      <ol>
        {rows.map((row, index) => {
          const last = complete && index === rows.length - 1;
          const detail = last
            ? 'Prépare ton porte-monnaie'
            : [
                row.account ? accountLabels[row.account] : '',
                row.recordedAt ? `relevé ${readingLabel(row.recordedAt, now)}` : 'aucun relevé ce mois',
                row.recordedAt && row.confirmedForClose ? 'confirmé pour la clôture' : '',
              ]
                .filter(Boolean)
                .join(' · ');
          return (
            <li
              key={row.player}
              className={cn(
                'grid items-center gap-3 border-t border-border py-3.5',
                wide ? 'grid-cols-[28px_34px_1fr_auto] px-5' : 'grid-cols-[24px_1fr_auto] px-4 first:border-t-0',
                row.player === me && 'bg-primary/7',
              )}
            >
              <span
                className={cn(
                  'font-numeral',
                  wide ? 'text-2xl' : 'text-[22px]',
                  last ? 'text-cost' : 'text-muted-foreground',
                )}
              >
                {index + 1}
              </span>
              {wide && (
                <PlayerAvatar
                  name={row.player}
                  me={row.player === me}
                  index={index}
                  className="size-[34px] [&_[data-slot=avatar-fallback]]:text-xs"
                />
              )}
              <span className="flex min-w-0 flex-col gap-0.5">
                <b className="text-[15px] font-semibold">
                  {row.player}
                  {row.player === me && (
                    <>
                      {' '}
                      <Badge variant="me" className="ml-1">
                        Toi
                      </Badge>
                    </>
                  )}
                </b>
                <small
                  className={cn('text-xs first-letter:uppercase', last ? 'text-cost-soft' : 'text-muted-foreground')}
                >
                  {detail}
                </small>
              </span>
              <b className={cn('font-numeral', wide ? 'text-[30px]' : 'text-[26px]')}>
                {row.mmr !== null ? formatNumber(row.mmr) : '—'}
              </b>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

const chevron = (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-dim"
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
);

/** The phone's page: the countdown, the ranking, the rule, then the drinks and the podium a tap away. */
function PhoneChallenge({ monthly, me }: { monthly: MonthlyState; me: string | null }) {
  return (
    <div className="relative flex flex-col gap-3.5 lg:hidden">
      <Countdown cutoffAt={monthly.current.cutoffAt} />
      <p className="mx-1 -mt-1 text-[13px] text-muted-foreground">
        Clôture {closingLabel(monthly.current.cutoffAt)}, heure de Paris.
      </p>
      <Ranking monthly={monthly} me={me} />
      <Panel aria-label="La règle" className="gap-2 p-4">
        <h2 className="font-display text-lg">La règle du bar</h2>
        <p className="text-sm leading-[1.45] text-soft">
          Le dernier doit une boisson à chacun des autres joueurs, soft ou alcool au choix. Ex æquo à la dernière place
          : aucune dette.
        </p>
        <p className="text-xs leading-[1.45] text-muted-foreground">
          Le meilleur MMR 2v2 de chaque joueur, entre son compte duo et son compte solo, relevé le dernier jour du mois.
        </p>
      </Panel>
      <nav aria-label="Plus sur le défi" className="overflow-hidden rounded-card border border-border bg-card">
        {(
          [
            ['/defi/bilans', 'Bilans et boissons'],
            ['/defi/podium', 'Podium de la semaine'],
          ] as const
        ).map(([to, label]) => (
          <Link
            key={to}
            to={to}
            className="flex min-h-[72px] items-center justify-between border-t border-border px-4 py-3.5 text-[15px] font-semibold text-foreground no-underline first:border-t-0 hover:text-link-hover hover:no-underline"
          >
            {label}
            {chevron}
          </Link>
        ))}
      </nav>
      <SeasonCountdown />
    </div>
  );
}

const cardModes = [
  { value: 'effort', label: 'Efforts' },
  { value: 'mmr', label: 'MMR' },
] as const;

/** The wide screen's podium card, which follows the same choice as the phone's podium page. */
function PodiumCard() {
  const podium = usePodium();
  return (
    <Panel
      aria-label="Podium de la semaine"
      className="box-content flex-[1_1_340px] gap-3.5 overflow-hidden px-5 pt-[18px]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 className="font-display text-xl">Podium de la semaine</h2>
        <Segmented label="Classer par" layout="header" items={cardModes} value={podium.mode} onChange={podium.choose} />
      </div>
      <p className="text-[13px] text-muted-foreground">{podium.shortLine}</p>
      {podium.missingMmr ? (
        <p className="pb-5 text-sm text-muted-foreground">
          Il faut le MMR du mois de chaque joueur pour afficher le podium.
        </p>
      ) : (
        <PodiumSteps ranked={podium.ranked} me={podium.me} size="card" className="min-h-[280px] flex-1" />
      )}
    </Panel>
  );
}

/** One closed month in a card: its drink to offer and its button, or why nothing is owed. */
function MonthSummaryCard({
  summary,
  actions,
}: {
  summary: ReturnType<typeof monthSummary>;
  actions: ReturnType<typeof useDrinkActions>;
}) {
  const id = useId();
  const action = summary.settle ?? summary.undo;
  return (
    <Panel
      className={cn(
        'box-content flex-row items-center gap-3.5 px-[18px] py-4',
        action ? 'flex-[1_1_340px]' : 'flex-[1_1_280px]',
      )}
    >
      <DrinkTile tone={summary.tone} />
      <span className="flex flex-1 flex-col gap-0.5">
        <b id={id} className="text-sm font-semibold">
          {summary.title}
        </b>
        <small className={cn('text-xs', summary.tone === 'owed' ? 'text-cost-soft' : 'text-muted-foreground')}>
          {summary.detail}
        </small>
      </span>
      {summary.settle ? (
        <DrinkButton
          kind="settle"
          disabled={actions.busy}
          onClick={() => summary.settle && actions.settle(summary.settle)}
          describedBy={id}
        />
      ) : summary.undo ? (
        <DrinkButton
          kind="undo"
          disabled={actions.busy}
          onClick={() => summary.undo && actions.undo(summary.undo)}
          describedBy={id}
        />
      ) : null}
    </Panel>
  );
}

/** The wide screen's "Bilans et boissons": a card a month, newest first; every drink in detail one click away. */
function DrinksSection({ monthly }: { monthly: MonthlyState }) {
  const actions = useDrinkActions();
  const closed = [...monthly.closed].sort((a, b) => b.month.localeCompare(a.month));
  return (
    <section aria-label="Bilans et boissons" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-[22px]">Bilans et boissons</h2>
        {closed.length > 0 && (
          <Link to="/defi/bilans" className="text-sm font-semibold">
            Tous les bilans
          </Link>
        )}
      </div>
      {closed.length ? (
        <div className="flex flex-wrap gap-5">
          {closed.map((result) => (
            <MonthSummaryCard
              key={result.month}
              summary={monthSummary(
                result,
                monthly.debts.filter((debt) => debt.month === result.month),
              )}
              actions={actions}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Le premier bilan apparaîtra à la fin de ce mois.</p>
      )}
    </section>
  );
}

/** The wide screen's page: the countdown and the ranking beside the podium, the drinks under them. */
function WideChallenge({ monthly, me }: { monthly: MonthlyState; me: string | null }) {
  return (
    <div className="hidden flex-col gap-5 lg:flex">
      <div className="flex flex-wrap gap-5">
        <div className="flex min-w-0 flex-[1.3_1_440px] flex-col gap-5">
          <Countdown cutoffAt={monthly.current.cutoffAt} wide />
          <Ranking monthly={monthly} me={me} wide />
        </div>
        <PodiumCard />
      </div>
      <DrinksSection monthly={monthly} />
      <SeasonCountdown />
    </div>
  );
}

export function ChallengePage() {
  const { data, me } = useBoardState();
  const monthly = data?.monthly;
  const outstanding = monthly?.debts.filter((debt) => !debt.paidAt).length ?? 0;
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[-16px] top-[calc(-14px-env(safe-area-inset-top))] h-[400px] bg-[radial-gradient(120%_70%_at_50%_-10%,var(--glow-cost),transparent_70%)] lg:hidden"
      />
      <PageHeader
        className="relative flex-nowrap gap-0 lg:flex-wrap lg:gap-4"
        kicker="Le défi du mois · 2v2"
        title="Qui paie sa tournée ?"
        actions={
          outstanding > 0 && (
            <Badge variant="pill" className="shrink border-0 whitespace-normal lg:px-[11px] lg:py-2">
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
        <>
          <PhoneChallenge monthly={monthly} me={me} />
          <WideChallenge monthly={monthly} me={me} />
        </>
      )}
    </>
  );
}
