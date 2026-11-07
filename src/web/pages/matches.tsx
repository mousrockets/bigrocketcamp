import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { cn } from 'cn';
import { CheckIcon } from 'lucide-react';
import { useState } from 'react';
import { formatNumber, parisDay } from '../../lib/domain';
import { useBoardState } from '../board/board-context';
import { matchesOf, matchesSummary, scoreboardOf, shiftDay, sourceLabel } from '../board/model';
import type { BoardState } from '../board/types';
import { useClub } from '../club';
import { type Match, matchTime, OutcomeTag, outcomeText, Pushups, Score } from '../components/club/match-parts';
import { BackLink, Note, PageGlow, PageHeader, Panel } from '../components/club/page';
import { Segmented } from '../components/club/segmented';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Skeleton } from '../components/ui/skeleton';
import { Switch } from '../components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

// The club's matches as received, and one match in detail: the list on the left of a wide screen, the detail on
// the right; on a phone, one after the other.

type Period = 'today' | 'yesterday' | 'pick' | 'all';
const periodItems: { value: Period; label: string }[] = [
  { value: 'today', label: 'Aujourd’hui' },
  { value: 'yesterday', label: 'Hier' },
  { value: 'pick', label: 'Date…' },
  { value: 'all', label: 'Tout' },
];
const dayLabel = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const shortWhen = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'long',
  hour: '2-digit',
  minute: '2-digit',
});
const receivedAt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const clock = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
const validDay = (day: unknown): day is string => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day);

export type MatchesSearch = { jour?: string; tests?: boolean };

function barClass(match: Match) {
  return match.outcome === 'defeat' ? 'bg-cost' : match.outcome === 'victory' ? 'bg-settled' : 'bg-faint';
}

function flags(match: Match): string {
  return [matchTime(match), match.kind === 'test' ? 'test bots' : '', match.left ? 'un joueur est parti' : '']
    .filter(Boolean)
    .join(' · ');
}

function MatchItem({ match, selected }: { match: Match; selected: boolean }) {
  return (
    <Link
      to="/matchs/$guid"
      params={{ guid: match.guid }}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'relative flex flex-col gap-2.5 overflow-hidden rounded-[20px] border border-border bg-card py-3.5 pr-4 pl-5 text-foreground no-underline hover:bg-accent/60 hover:no-underline',
        'lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-3.5 lg:rounded-none lg:border-0 lg:border-t lg:py-3.5 lg:pl-6',
        selected && 'lg:bg-primary/8 lg:shadow-[inset_3px_0_0_var(--primary)]',
      )}
    >
      <i
        aria-hidden="true"
        className={cn(
          'absolute top-3.5 bottom-3.5 left-0 w-1 rounded-r-[3px] lg:left-4 lg:rounded-[2px]',
          barClass(match),
        )}
      />
      <div className="flex items-center justify-between gap-2 lg:contents">
        <span className="flex min-w-0 flex-col gap-1 lg:pl-3">
          <span className="flex items-center gap-2">
            <OutcomeTag match={match} className="text-[10px]" />
            <span className="kicker truncate">{flags(match)}</span>
          </span>
          <small className="hidden truncate text-xs text-soft lg:block">
            {match.players.map(({ row, pushups }) => `${row.name}${pushups ? ` +${pushups}` : ''}`).join(' · ')}
          </small>
        </span>
        <Score match={match} className="text-[30px] leading-none lg:text-[28px]" />
      </div>
      <div className="flex flex-col gap-1.5 lg:hidden">
        {match.players.map(({ row, pushups, lastPlace }) => (
          <div key={row.player_id} className="flex justify-between gap-2 text-[13px] text-soft">
            <span className="truncate">
              {row.name} · {formatNumber(row.score)} pts{lastPlace ? ' · moins de pts' : ''}
            </span>
            <Pushups value={pushups} className="font-sans text-[13px] font-bold" />
          </div>
        ))}
      </div>
    </Link>
  );
}

function MatchDetail({ match, data }: { match: Match; data: BoardState }) {
  const { roster } = useClub();
  const clubTeam = match.outcome === 'between-members' ? 0 : (match.players[0]?.row.team ?? 0);
  const lines = scoreboardOf(roster, data, match.guid, clubTeam);
  const owed = new Map(match.players.map((p) => [p.row.player_id, p]));
  const total = match.players.reduce((sum, p) => sum + p.pushups, 0);
  const lowest = match.players.filter((p) => p.lastPlace);
  const when = match.received
    ? shortWhen.format(new Date(match.received))
    : dayLabel.format(new Date(`${match.day}T12:00:00Z`));
  const first = match.players[0]?.row;
  const line =
    match.outcome === 'defeat'
      ? `${outcomeText(match)}. ${total} pompe${total > 1 ? 's' : ''} générée${total > 1 ? 's' : ''} pour le club.`
      : match.outcome === 'victory'
        ? 'Victoire. Aucune pompe pour le club.'
        : match.outcome === 'review'
          ? 'Les sources ne sont pas d’accord : ce match ne compte pas tant qu’il n’est pas vérifié.'
          : 'Match entre membres du club : le perdant compte ses pompes.';
  return (
    <div className="flex flex-col gap-3.5 lg:gap-0">
      <section
        aria-label="Score final"
        className={cn(
          'relative flex flex-col items-center gap-2.5 py-2 lg:gap-3 lg:px-6 lg:pt-7 lg:pb-6',
          match.outcome === 'defeat' && 'lg:bg-[radial-gradient(90%_100%_at_50%_0%,var(--glow-cost),transparent_70%)]',
        )}
      >
        <span className="kicker">
          {match.kind === 'test' ? 'Test bots' : 'Match'} · {when}
        </span>
        <OutcomeTag match={match} className="lg:hidden" />
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 lg:gap-3">
          <span className="flex flex-col items-center gap-1.5 text-[13px] font-semibold text-soft lg:text-sm">
            <i aria-hidden="true" className="h-1 w-7 rounded-sm bg-primary lg:w-8" />
            {match.outcome === 'between-members' ? 'Équipe 1' : 'Le club'}
          </span>
          <Score
            match={match}
            className="text-[110px] leading-[0.8] font-black lg:text-[120px]"
            dashClassName="text-[44px] lg:text-5xl"
          />
          <span className="flex flex-col items-center gap-1.5 text-[13px] font-semibold text-soft lg:text-sm">
            <i aria-hidden="true" className="h-1 w-7 rounded-sm bg-cost lg:w-8" />
            {match.outcome === 'between-members' ? 'Équipe 2' : 'Adversaires'}
          </span>
        </div>
        {match.left && <span className="text-[13px] text-muted-foreground">Un joueur est parti avant la fin</span>}
        <p className="mt-1.5 text-center text-[15px] text-balance text-soft">{line}</p>
      </section>
      <Panel aria-label="Tableau des points" className="lg:rounded-none lg:border-0 lg:border-t">
        <div className="overflow-x-auto">
          <Table className="text-sm tabular-nums">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {['Joueur', 'Pts', 'Buts', 'Pompes'].map((label, index) => (
                  <TableHead
                    key={label}
                    scope="col"
                    className={cn(
                      'kicker h-auto px-2.5 py-2.5 tracking-[0.06em] first:pl-3.5 lg:px-5 lg:first:pl-5',
                      index > 0 && 'text-right',
                    )}
                  >
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map(({ row, member, label }) => {
                const player = owed.get(row.player_id);
                return (
                  <TableRow key={row.player_id} className={cn(!member && 'text-muted-foreground')}>
                    <TableCell className="py-[11px] pr-2.5 pl-3.5 whitespace-normal lg:px-5">
                      {member ? <b className="font-semibold">{label}</b> : label}
                      {player?.lastPlace && (
                        <small className="block text-xs text-muted-foreground">Moins de points de l’équipe</small>
                      )}
                    </TableCell>
                    <TableCell className="px-2.5 text-right lg:px-5">{formatNumber(row.score)}</TableCell>
                    <TableCell className="px-2.5 text-right lg:px-5">{row.goals ?? '—'}</TableCell>
                    <TableCell className="px-2.5 text-right lg:px-5">
                      {player ? <Pushups value={player.pushups} className="font-sans font-bold" /> : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Panel>
      {total > 0 && (
        <Panel aria-label="Calcul des pompes" className="gap-2.5 p-4 lg:rounded-none lg:border-0 lg:border-t lg:px-5">
          <h2 className="font-display text-lg">Pourquoi ces pompes</h2>
          <div className="flex justify-between text-sm text-soft">
            <span>Défaite · chaque joueur du club</span>
            <b>5</b>
          </div>
          {lowest.map(({ row }) => (
            <div key={row.player_id} className="flex justify-between text-sm text-soft">
              <span>Moins de points de l’équipe · {row.name}</span>
              <b>+5</b>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-2.5 text-sm">
            <span>Total pour le club</span>
            <b className="font-numeral text-xl text-cost">{total}</b>
          </div>
        </Panel>
      )}
      {first && (
        <p className="flex items-start gap-2 px-1 text-xs leading-[1.45] text-muted-foreground lg:border-t lg:border-border lg:px-5 lg:py-4">
          <CheckIcon
            aria-hidden="true"
            className={cn(
              'mt-px size-3.5 shrink-0',
              first.verification === 'confirmed' ? 'text-settled' : 'text-muted-foreground',
            )}
          />
          {[match.received ? `Reçu le ${receivedAt.format(new Date(match.received))}` : '', sourceLabel(first)]
            .filter(Boolean)
            .join(' · ')}
          .
        </p>
      )}
    </div>
  );
}

function lastReception(data: BoardState): string {
  const seen = data.collectors[0]?.last_seen;
  if (!seen) return 'En attente de la première collecte';
  const at = new Date(seen);
  return Date.now() - at.getTime() < 86_400_000
    ? `Dernier match reçu à ${clock.format(at)}`
    : `Dernier match reçu le ${receivedAt.format(at)}`;
}

export function MatchesPage({ guid }: { guid?: string }) {
  const { roster } = useClub();
  const { data } = useBoardState();
  const search = useSearch({ strict: false }) as MatchesSearch;
  const navigate = useNavigate();
  const today = parisDay();
  const yesterday = shiftDay(today, -1);
  const [picking, setPicking] = useState(false);
  const day = search.jour === 'tout' ? '' : validDay(search.jour) && search.jour <= today ? search.jour : today;
  const tests = search.tests === true;
  const period: Period = picking
    ? 'pick'
    : day === ''
      ? 'all'
      : day === today
        ? 'today'
        : day === yesterday
          ? 'yesterday'
          : 'pick';
  const setSearch = (next: MatchesSearch) =>
    navigate({
      to: guid ? '/matchs/$guid' : '/matchs',
      params: guid ? { guid } : {},
      search: next,
      replace: true,
    } as never);
  const choose = (next: Period) => {
    setPicking(next === 'pick');
    if (next === 'today') setSearch({ ...(tests && { tests }) });
    if (next === 'yesterday') setSearch({ jour: yesterday, ...(tests && { tests }) });
    if (next === 'all') setSearch({ jour: 'tout', ...(tests && { tests }) });
  };

  const matches = data ? matchesOf(roster, data, { day, tests }) : [];
  const all = data && guid ? matchesOf(roster, data, { tests: true }) : [];
  const detail = guid ? all.find((match) => match.guid === guid) : matches[0];
  const when =
    day === ''
      ? 'en tout'
      : day === today
        ? 'aujourd’hui'
        : day === yesterday
          ? 'hier'
          : `le ${dayLabel.format(new Date(`${day}T12:00:00Z`))}`;
  const groups = new Map<string, Match[]>();
  for (const match of matches) groups.set(match.day, [...(groups.get(match.day) ?? []), match]);
  const groupLabel = (d: string) =>
    d === today ? 'Aujourd’hui' : d === yesterday ? 'Hier' : dayLabel.format(new Date(`${d}T12:00:00Z`));

  const status = data && (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <i aria-hidden="true" className={cn('size-[7px] rounded-full', data.collectors[0] ? 'bg-settled' : 'bg-faint')} />
      {lastReception(data)}
    </span>
  );

  const list = (
    <div className="flex flex-col gap-3.5 lg:gap-0 lg:overflow-hidden lg:rounded-card lg:border lg:border-border lg:bg-card">
      <p className="px-1 text-sm text-soft lg:px-4 lg:py-3.5 lg:text-[13px] lg:text-muted-foreground">
        {matchesSummary(matches, when)}
      </p>
      {[...groups].map(([groupDay, items]) => (
        <section key={groupDay} aria-label={groupLabel(groupDay)} className="flex flex-col gap-3.5 lg:gap-0">
          {day === '' && (
            <h2 className="px-1 pt-2 text-[13px] font-bold first-letter:uppercase lg:border-t lg:border-border lg:px-4 lg:pb-1">
              {groupLabel(groupDay)}
            </h2>
          )}
          {items.map((match) => (
            <MatchItem key={match.guid} match={match} selected={match.guid === detail?.guid} />
          ))}
        </section>
      ))}
      <div className="flex min-h-11 items-center justify-between gap-3 px-1 py-3 text-sm text-soft lg:border-t lg:border-border lg:px-4">
        <Label htmlFor="tests-switch" className="text-sm font-normal text-soft">
          Inclure les tests bots
        </Label>
        <Switch
          id="tests-switch"
          checked={tests}
          onCheckedChange={(checked) =>
            setSearch({ ...(search.jour && { jour: search.jour }), ...(checked && { tests: true }) })
          }
        />
      </div>
    </div>
  );

  return (
    <>
      <PageGlow tone={guid && detail?.outcome === 'defeat' ? 'cost' : 'blue'} />
      <div className={cn('relative flex flex-col gap-3.5 lg:gap-5', guid && 'max-lg:hidden')}>
        <PageHeader
          kicker={<span className="hidden lg:inline">Reçus par le Direct PC</span>}
          title="Matchs"
          actions={<span className="lg:hidden">{status}</span>}
        />
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <span className="hidden lg:block">{status}</span>
          <div className="flex flex-col gap-2 lg:w-[460px]">
            <Segmented label="Période" items={periodItems} value={period} onChange={choose} size="sm" />
            {period === 'pick' && (
              <div className="flex items-center gap-3 text-sm text-soft">
                <Label htmlFor="matches-day" className="font-normal">
                  Date
                </Label>
                <Input
                  id="matches-day"
                  type="date"
                  value={day || today}
                  max={today}
                  onChange={(event) =>
                    event.target.value && setSearch({ jour: event.target.value, ...(tests && { tests }) })
                  }
                  className="h-10 w-auto"
                />
              </div>
            )}
          </div>
        </div>
      </div>
      {!data ? (
        <Skeleton className="h-[400px] rounded-card" />
      ) : (
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className={cn('flex flex-col gap-3.5 lg:flex-[1_1_340px] lg:min-w-0', guid && 'max-lg:hidden')}>
            {list}
            <Note>
              {data.reliability
                ? `Historique vérifié : ${data.reliability.confirmed} résultat(s) confirmé(s) par les deux sources · ${data.reliability.corrected} corrigé(s) · ${data.reliability.single} reçu(s) d’une seule source.`
                : ''}
              {data.reliability?.review
                ? ` ${data.reliability.review} résultat(s) à vérifier, exclus du calcul des pompes.`
                : ''}{' '}
              Les tests bots ne comptent pas.{' '}
              <Link to="/connexions" className="font-semibold">
                Identités des joueurs
              </Link>
            </Note>
          </div>
          <div
            className={cn(
              'flex min-w-0 flex-col gap-3.5 lg:flex-[1.7_1_480px] lg:overflow-hidden lg:rounded-card lg:border lg:border-border lg:bg-card',
              !guid && 'max-lg:hidden',
            )}
          >
            {guid && (
              <header className="flex h-11 items-center justify-between lg:hidden">
                <BackLink to="/matchs" label="Retour aux matchs" />
                <span className="kicker">Détail du match</span>
                <span className="w-11" />
              </header>
            )}
            {detail ? (
              <MatchDetail match={detail} data={data} />
            ) : (
              <p className="p-6 text-sm text-muted-foreground">
                {guid
                  ? 'Ce match n’existe pas ou plus dans l’historique du club.'
                  : 'Choisis un match pour voir son détail.'}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
