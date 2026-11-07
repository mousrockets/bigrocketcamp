import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { cn } from 'cn';
import { FlameIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatNumber, parisDay } from '../../lib/domain';
import { useBoardState } from '../board/board-context';
import {
  daysUntil,
  debtLine,
  filledSegments,
  lastDefeatOf,
  lastMatchOf,
  matchesOf,
  monthLead,
  shiftDay,
  sinceLabel,
  standingsOf,
  statsOf,
  streaksOf,
} from '../board/model';
import type { BoardState } from '../board/types';
import { playerPlatform, useClub } from '../club';
import { ClubHeader } from '../components/club/app-shell';
import { type Match, matchTime, OutcomeTag, Pushups, Score } from '../components/club/match-parts';
import { PageGlow, Panel } from '../components/club/page';
import { PlayerAvatar } from '../components/club/player-avatar';
import { Segmented } from '../components/club/segmented';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { useDeclare } from '../declare/declare-context';

// The club's home: the last match, the member's debt, the team by MMR, and the month's challenge.

type Period = 'today' | 'yesterday' | 'all';
const periodItems: { value: Period; label: string }[] = [
  { value: 'today', label: 'Aujourd’hui' },
  { value: 'yesterday', label: 'Hier' },
  { value: 'all', label: 'Tout' },
];
const monthName = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', month: 'long' });
const longDay = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** The old board's anchors, from links and bookmarks: each opens what replaced it. */
const oldAnchors: Record<string, string> = {
  history: '/tableau#history',
  'monthly-mmr': '/tableau#monthly-mmr',
  week: '/tableau#week',
  'recap-title': '/recap',
};

function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

function LastMatch({ match, now }: { match: Match; now: number }) {
  const club = match.players.map((p) => p.row.name).join(' · ');
  const label = `Dernier match : ${match.outcome === 'defeat' ? 'défaite' : match.outcome === 'victory' ? 'victoire' : 'résultat'}${match.score ? ` ${match.score[0]} à ${match.score[1]}` : ''}`;
  return (
    <Link
      to="/matchs"
      aria-label={label}
      className="flex flex-col overflow-hidden rounded-card border border-border bg-card text-foreground no-underline transition-colors hover:bg-[#141418] hover:no-underline"
    >
      <div className="flex items-center justify-between px-4 pt-3.5 lg:px-6 lg:pt-5">
        <span className="kicker">Dernier match · {match.received ? sinceLabel(match.received, now) : match.day}</span>
        <OutcomeTag match={match} />
      </div>
      <div className="grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 pt-3 pb-3.5 lg:gap-2.5 lg:px-6 lg:py-[18px]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-soft lg:text-sm">
            <i aria-hidden="true" className="h-4 w-1 rounded-sm bg-primary lg:h-[18px]" />
            Le club
          </span>
          <span className="truncate text-xs text-muted-foreground">{club}</span>
        </div>
        <Score
          match={match}
          className="text-[68px] leading-[0.9] lg:text-[96px] lg:leading-[0.85]"
          dashClassName="text-[28px] lg:text-4xl"
        />
        <div className="flex min-w-0 flex-col items-end gap-1.5 text-right">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-soft lg:text-sm">
            Adversaires
            <i aria-hidden="true" className="h-4 w-1 rounded-sm bg-cost lg:h-[18px]" />
          </span>
          <span className="text-xs text-muted-foreground">
            {[matchTime(match), match.left ? 'un joueur est parti' : ''].filter(Boolean).join(' · ')}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 border-t border-border">
        {match.players.map(({ row, pushups, lastPlace }, index) => (
          <div
            key={row.player_id}
            className={cn(
              'flex items-center justify-between gap-2 px-4 py-3 lg:px-6 lg:py-3.5',
              index % 2 === 0 && 'border-r border-border',
            )}
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <b className="truncate text-sm font-semibold">{row.name}</b>
              <small className="text-xs text-muted-foreground">
                {formatNumber(row.score)} pts{lastPlace ? ' · moins de pts' : ''}
              </small>
            </span>
            <Pushups value={pushups} className="text-[22px]" />
          </div>
        ))}
      </div>
    </Link>
  );
}

function MyDebt({ data, me }: { data: BoardState; me: string }) {
  const { roster } = useClub();
  const { openDeclare } = useDeclare();
  const today = parisDay();
  const stats = statsOf(roster, data).find((line) => line.name === me);
  const streak = streaksOf(roster, data, today).get(me);
  if (!stats) return null;
  const lastDefeat = lastDefeatOf(roster, data, me);
  const filled = filledSegments(stats.done, stats.due);
  const settled = stats.remaining === 0;
  return (
    <Panel aria-label="Ma dette" className="relative gap-3 px-4 pt-[18px] pb-4 lg:gap-4 lg:p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(90%_80%_at_0%_0%,var(--glow),transparent_70%)] lg:block"
      />
      <div className="relative flex items-center justify-between">
        <span className="kicker">Ta dette</span>
        {streak && streak.current > 0 && (
          <span className="flex items-center gap-1 text-xs font-semibold text-streak">
            <FlameIcon aria-hidden="true" className="size-3.5" />
            {streak.current} jour{streak.current > 1 ? 's' : ''} d’affilée
          </span>
        )}
      </div>
      <div className="relative flex items-end justify-between gap-3">
        <div className="flex items-end gap-2.5 lg:gap-3.5">
          <span
            className={cn(
              'font-numeral text-[112px] leading-[0.78] font-black tracking-[-0.03em] lg:text-[150px] lg:leading-[0.76]',
              settled && 'text-settled',
            )}
          >
            {formatNumber(stats.remaining)}
          </span>
          <span className="pb-1 font-display text-lg leading-[1.05] font-bold [font-stretch:75%] text-soft lg:pb-1.5 lg:text-[22px]">
            {settled ? (
              <>à jour</>
            ) : (
              <>
                pompes
                <br />à rendre
              </>
            )}
          </span>
        </div>
        <span className="pb-1 text-right text-[13px] leading-[1.35] text-muted-foreground lg:pb-1.5">
          {stats.done < stats.due ? (
            <>
              {formatNumber(stats.done)} / {formatNumber(stats.due)}
              <br />
              réalisées
            </>
          ) : (
            <>
              {formatNumber(stats.done)} réalisées
              <br />
              {formatNumber(stats.due)} dues
            </>
          )}
        </span>
      </div>
      <div aria-hidden="true" className="relative grid grid-cols-10 gap-[3px] lg:gap-1">
        {Array.from({ length: 10 }, (_, index) => (
          <i
            // biome-ignore lint/suspicious/noArrayIndexKey: ten fixed blocks.
            key={index}
            style={{ animationDelay: `${index * 40}ms` }}
            className={cn(
              'h-1.5 rounded-[2px] lg:h-[7px]',
              index < filled ? cn('animate-fill', settled ? 'bg-settled' : 'bg-primary') : 'bg-track',
            )}
          />
        ))}
      </div>
      <div className="relative flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-3.5">
        <p className="text-sm leading-[1.4] text-pretty text-soft lg:flex-[1_1_240px] lg:text-[15px]">
          {debtLine(stats.remaining, lastDefeat, today)}
        </p>
        <Button
          variant="inverse"
          size="xl"
          onClick={() => openDeclare(me)}
          className="w-full lg:h-[50px] lg:w-auto lg:px-[22px] lg:text-base"
        >
          Déclarer un exercice
        </Button>
      </div>
    </Panel>
  );
}

function Team({ data, me, period }: { data: BoardState; me: string | null; period: Period }) {
  const { roster, players } = useClub();
  const today = parisDay();
  const day = period === 'today' ? today : period === 'yesterday' ? shiftDay(today, -1) : '';
  const debts = new Map(statsOf(roster, data).map((line) => [line.name, line.remaining]));
  const periodStats = new Map(statsOf(roster, data, day).map((line) => [line.name, line]));
  const generated = new Map<string, number>();
  for (const match of matchesOf(roster, data, { day })) {
    for (const { row, pushups } of match.players) generated.set(row.name, (generated.get(row.name) ?? 0) + pushups);
  }
  const standings = standingsOf(roster, data);
  const debtClass = (debt: number) => (debt > 0 ? 'text-cost' : 'text-settled');
  return (
    <>
      <Panel className="lg:hidden">
        <ol aria-label="L’équipe au MMR 2v2">
          {standings.map(({ name, index, rank }, position) => (
            <li
              key={name}
              className={cn(
                'grid min-h-11 grid-cols-[22px_36px_1fr_auto_40px] items-center gap-2.5 border-t border-border px-3.5 py-3 first:border-t-0',
                name === me && 'bg-primary/7',
              )}
            >
              <span className="font-numeral text-[17px] text-muted-foreground">{position + 1}</span>
              <PlayerAvatar name={name} me={name === me} index={index} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <b className="truncate text-[15px] font-semibold">
                  {name}
                  {name === me && (
                    <Badge variant="me" className="ml-1 align-middle">
                      Toi
                    </Badge>
                  )}
                </b>
                <small className="truncate text-xs text-muted-foreground">
                  {[rank?.label || 'Rang non reçu', playerPlatform(players, name)].filter(Boolean).join(' · ')}
                </small>
              </span>
              <span className="font-numeral text-[19px] font-bold">
                {rank?.mmr != null ? formatNumber(rank.mmr) : '—'}
              </span>
              <span className={cn('text-right font-numeral text-base font-bold', debtClass(debts.get(name) ?? 0))}>
                <span className="sr-only">Pompes dues : </span>
                {formatNumber(debts.get(name) ?? 0)}
              </span>
            </li>
          ))}
        </ol>
      </Panel>
      <span className="px-1 text-xs text-muted-foreground lg:hidden">MMR 2v2 · pompes dues</span>
      <div className="hidden overflow-x-auto lg:block">
        <Table className="text-sm tabular-nums">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {[
                'Joueur',
                'Rang 2v2',
                'MMR',
                periodItems.find((p) => p.value === period)?.label ?? '',
                'Générées',
                'Dette',
              ].map((label, index) => (
                <TableHead
                  key={label}
                  className={cn('kicker h-auto px-4 py-3 tracking-[0.08em]', index > 0 && 'text-right')}
                >
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {standings.map(({ name, index, rank }) => {
              const line = periodStats.get(name);
              const made = generated.get(name) ?? 0;
              const debt = debts.get(name) ?? 0;
              return (
                <TableRow key={name} className={cn(name === me && 'bg-primary/6')}>
                  <TableCell className="px-4 py-3">
                    <span className="flex items-center gap-2.5">
                      <PlayerAvatar name={name} me={name === me} index={index} className="size-[34px]" />
                      <b className="font-semibold">{name}</b>
                      {name === me && <Badge variant="me">Toi</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right text-soft">{rank?.label || '—'}</TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    {rank?.mmr != null ? formatNumber(rank.mmr) : '—'}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    {line?.played ? `${line.wins}–${line.losses}` : '—'}
                  </TableCell>
                  <TableCell className={cn('px-4 py-3 text-right', made > 0 ? 'text-cost' : 'text-muted-foreground')}>
                    {made > 0 ? `+${made}` : '0'}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <b className={cn('font-numeral text-xl', debtClass(debt))}>{formatNumber(debt)}</b>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

function Challenge({ data, now }: { data: BoardState; now: number }) {
  const monthly = data.monthly;
  if (!monthly) return null;
  const lead = monthLead(data);
  const days = daysUntil(monthly.current.cutoffAt, now);
  const month = monthName.format(new Date(`${monthly.current.month}-15T12:00:00Z`));
  return (
    <Link
      to="/defi"
      className="flex items-center justify-between gap-3 rounded-card border border-border bg-card p-4 text-foreground no-underline hover:bg-[#141418] hover:no-underline lg:flex-[1_1_280px] lg:flex-col lg:items-stretch lg:justify-between lg:gap-4 lg:p-5"
    >
      <div className="flex flex-col gap-1 lg:contents">
        <span className="kicker">Défi de {month}</span>
        <span className="hidden items-baseline gap-2 lg:order-1 lg:flex">
          <b className="font-numeral text-7xl leading-[0.85]">{days}</b>
          <span className="text-[15px] text-muted-foreground">jour{days > 1 ? 's' : ''} avant la clôture</span>
        </span>
        <span className="flex flex-col gap-1 lg:order-2">
          <b className="text-base font-semibold">
            {lead ? `${lead.leader} mène de ${formatNumber(lead.gap)} MMR` : `Classement de ${month}`}
          </b>
          <small className="text-[13px] text-muted-foreground">Le dernier offre une boisson à chacun</small>
        </span>
      </div>
      <div className="flex flex-col items-end leading-[0.9] lg:hidden">
        <span className="font-numeral text-4xl">
          {days}
          <span className="text-lg text-muted-foreground"> J</span>
        </span>
        <span className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground">CLÔTURE</span>
      </div>
    </Link>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-3.5" aria-busy="true">
      <p className="sr-only">Chargement du club…</p>
      <Skeleton className="h-[210px] rounded-card" />
      <Skeleton className="h-[260px] rounded-card" />
      <Skeleton className="h-[200px] rounded-card" />
    </div>
  );
}

export function ClubPage() {
  const { roster } = useClub();
  const { data, error, refresh, me } = useBoardState();
  const { openDeclare } = useDeclare();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const now = useNow();
  const [period, setPeriod] = useState<Period>('today');

  // biome-ignore lint/correctness/useExhaustiveDependencies: reacts to the address only.
  useEffect(() => {
    if (hash === 'exercise') {
      openDeclare();
      navigate({ to: '/', hash: '', replace: true });
    } else if (oldAnchors[hash]) {
      location.replace(oldAnchors[hash]);
    }
  }, [hash]);

  const last = data ? lastMatchOf(roster, data) : null;
  return (
    <>
      <PageGlow />
      <ClubHeader />
      <header className="relative hidden flex-wrap items-end justify-between gap-4 lg:flex">
        <div className="flex flex-col gap-1">
          <span className="kicker">{longDay.format(now)}</span>
          <h1 className="font-display text-[40px] leading-none">Club</h1>
        </div>
        <div className="w-[360px]">
          <Segmented label="Période affichée" items={periodItems} value={period} onChange={setPeriod} size="sm" />
        </div>
      </header>
      <h1 className="sr-only lg:hidden">Club</h1>
      {error && (
        <Alert variant="destructive" role="alert" className="relative">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            {error}
            <Button size="sm" variant="outline" onClick={() => refresh()}>
              Actualiser
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {data?.rankSource?.stale && (
        <Alert className="relative">
          <AlertDescription>
            {data.rankSource.lastReadAt
              ? `Les rangs 2v2 ne sont plus relevés automatiquement depuis le ${new Date(data.rankSource.lastReadAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`
              : 'Les rangs 2v2 n’ont encore jamais été relevés automatiquement.'}{' '}
            Préviens la personne qui gère l’instance : l’observateur des rangs est peut-être en panne.
          </AlertDescription>
        </Alert>
      )}
      {!data ? (
        <Loading />
      ) : (
        <>
          <div className="relative flex flex-col gap-3.5 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(min(400px,100%),1fr))] lg:gap-5">
            <div className="order-2 lg:order-1">{me ? <MyDebt data={data} me={me} /> : null}</div>
            <div className="order-1 lg:order-2 lg:flex">
              {last ? (
                <div className="flex-1 [&>a]:h-full">
                  <LastMatch match={last} now={now} />
                </div>
              ) : (
                <Panel className="flex-1 justify-center p-6 text-sm text-muted-foreground">
                  Aucun match reçu pour l’instant. Le premier arrivera avec le Direct PC ou le collecteur.
                </Panel>
              )}
            </div>
          </div>
          <div className="relative flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:gap-5">
            <section
              aria-labelledby="team-title"
              className="flex min-w-0 flex-col gap-2 lg:flex-[2_1_560px] lg:overflow-hidden lg:rounded-card lg:border lg:border-border lg:bg-card"
            >
              <div className="flex items-baseline justify-between px-1 pt-1.5 lg:px-4 lg:pt-[18px] lg:pb-1">
                <h2 id="team-title" className="font-display text-[22px]">
                  L’équipe
                </h2>
                <Link to="/recap" className="text-[13px] font-semibold no-underline hover:underline">
                  Récap du jour
                </Link>
              </div>
              <Team data={data} me={me} period={period} />
            </section>
            <Challenge data={data} now={now} />
          </div>
          <p className="relative hidden text-[11px] text-muted-foreground lg:block">
            Ce produit n’est pas officiel et n’a pas l’approbation d’Epic Games.
          </p>
        </>
      )}
    </>
  );
}
