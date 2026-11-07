import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { cn } from 'cn';
import { formatNumber, parisDay } from '../../lib/domain';
import { useBoardState } from '../board/board-context';
import { matchesOf, matchesSummary, scoreboardOf, shiftDay, sourceLabel } from '../board/model';
import type { BoardState } from '../board/types';
import { useClub } from '../club';
import { type Match, matchTime, OutcomeTag, Pushups, Score } from '../components/club/match-parts';
import { BackLink, fieldVariants, Note, PageHeader, PageStack, Panel } from '../components/club/page';
import { Segmented } from '../components/club/segmented';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

// The club's matches as received, and one match in detail: the list on the left of a wide screen, the detail on
// the right; on a phone, one after the other.

type Period = 'today' | 'yesterday' | 'pick' | 'all';
const periodItems: { value: Period; label: string }[] = [
  { value: 'today', label: 'Aujourd’hui' },
  { value: 'yesterday', label: 'Hier' },
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
const hourOf = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' });
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

/** The design's "Ce soir", "Après-midi": when in the day a match was received. */
function momentOf(match: Match, day: 'today' | 'yesterday' | 'other'): string {
  if (!match.received) return '';
  const hour = Number(hourOf.formatToParts(new Date(match.received)).find((part) => part.type === 'hour')?.value);
  if (hour >= 18) return day === 'today' ? 'Ce soir' : day === 'yesterday' ? 'Hier soir' : 'Soir';
  if (hour >= 12) return 'Après-midi';
  if (hour >= 6) return 'Matin';
  return 'Nuit';
}

function MatchItem({ match, selected }: { match: Match; selected: boolean }) {
  return (
    <Link
      to="/matchs/$guid"
      params={{ guid: match.guid }}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'relative flex flex-col gap-2.5 overflow-hidden rounded-[20px] border border-border bg-card py-3.5 pr-4 pl-5 text-foreground no-underline max-lg:lift hover:text-foreground hover:no-underline max-lg:hover:bg-accent/60',
        'lg:grid lg:grid-cols-[4px_1fr_auto] lg:items-center lg:gap-3.5 lg:rounded-none lg:border-0 lg:border-t lg:px-4 lg:hover:bg-row-hover',
        selected && 'lg:bg-primary/8 lg:shadow-[inset_3px_0_0_var(--primary)] lg:hover:bg-primary/8',
      )}
    >
      <i
        aria-hidden="true"
        className={cn(
          'absolute top-3.5 bottom-3.5 left-0 w-1 rounded-r-[3px] lg:static lg:h-9 lg:rounded-[2px]',
          barClass(match),
        )}
      />
      <div className="flex items-center justify-between gap-2 lg:contents">
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2">
            <OutcomeTag match={match} className="rounded-[4px] px-1.5 text-[10px]" />
            <span className="kicker truncate">{flags(match)}</span>
          </span>
          <small className="hidden truncate text-xs text-soft lg:block">
            {match.players.map(({ row, pushups }) => `${row.name}${pushups ? ` +${pushups}` : ''}`).join(' · ')}
          </small>
        </span>
        <Score
          match={match}
          className="text-[30px] leading-none lg:text-[28px] lg:leading-[normal]"
          dashClassName="px-0"
        />
      </div>
      {match.players.map(({ row, pushups, lastPlace }) => (
        <div key={row.player_id} className="flex justify-between gap-2 text-[13px] text-soft lg:hidden">
          <span className="truncate">
            {row.name} · {formatNumber(row.score)} pts{lastPlace ? ' · moins de pts' : ''}
          </span>
          <Pushups value={pushups} className="font-sans text-[13px] font-bold" />
        </div>
      ))}
    </Link>
  );
}

function CheckMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', className)}
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** The design's playful sentence under the score. */
function verdict(match: Match, total: number): string {
  if (match.outcome === 'review')
    return 'Les sources ne sont pas d’accord : ce match ne compte pas tant qu’il n’est pas vérifié.';
  if (match.outcome === 'between-members') return 'Match entre membres du club : le perdant compte ses pompes.';
  if (match.outcome === 'victory') return 'GG. Aucune pompe pour le club.';
  const close = match.score && Math.abs(match.score[0] - match.score[1]) === 1;
  return close
    ? 'Perdu d’un but. Au moins, vous avez tenu le suspense.'
    : `Perdu. ${total} pompe${total > 1 ? 's' : ''} pour le club : les bras vont chauffer.`;
}

/** The rule a wide screen sums up under the scoreboard: "Défaite : 5 pompes chacun · moins de points : +5". */
function ruleOf(match: Match, bonus: number): string {
  if (match.outcome === 'review') return 'À vérifier : ne compte pas encore';
  if (match.outcome === 'between-members') return 'Entre membres : le perdant compte ses pompes';
  if (match.outcome === 'victory') return 'Victoire : aucune pompe';
  return `Défaite : 5 pompes chacun${bonus ? ` · moins de points : +${bonus}` : ''}`;
}

function MatchDetail({ match, data, meta }: { match: Match; data: BoardState; meta: string }) {
  const { roster } = useClub();
  const clubTeam = match.outcome === 'between-members' ? 0 : (match.players[0]?.row.team ?? 0);
  const lines = scoreboardOf(roster, data, match.guid, clubTeam);
  const owed = new Map(match.players.map((p) => [p.row.player_id, p]));
  const total = match.players.reduce((sum, p) => sum + p.pushups, 0);
  const lowest = match.players.filter((p) => p.lastPlace);
  const bonus = lowest[0] ? lowest[0].pushups - 5 : 0;
  const first = match.players[0]?.row;
  const confirmed = first?.verification === 'confirmed';
  const source = first ? sourceLabel(first) : '';
  const cell = 'px-3.5 py-[11px] text-right lg:px-5 lg:py-3';
  return (
    <>
      <section
        aria-label="Score final"
        className={cn(
          'relative flex flex-col items-center gap-2.5 pt-2 pb-1.5 lg:gap-3 lg:px-6 lg:pt-7 lg:pb-6',
          match.outcome === 'defeat' &&
            'lg:bg-[radial-gradient(90%_100%_at_50%_0%,rgb(255_159_69/0.12),rgb(17_17_20/0)_70%)]',
        )}
      >
        <span className="kicker hidden lg:inline">
          {meta}
          {match.left ? ' · Un joueur est parti' : ''}
        </span>
        <OutcomeTag match={match} className="px-2 py-1 tracking-[0.12em] lg:hidden" />
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 lg:gap-3">
          <span className="flex flex-col items-center gap-1.5 text-[13px] font-semibold text-soft lg:text-sm">
            <i aria-hidden="true" className="h-1 w-7 rounded-[2px] bg-primary lg:w-8" />
            {match.outcome === 'between-members' ? 'Équipe 1' : 'Le club'}
          </span>
          <Score
            match={match}
            spaced
            className="text-[110px] leading-[0.8] font-black lg:text-[120px]"
            dashClassName="text-[44px] lg:text-5xl"
          />
          <span className="flex flex-col items-center gap-1.5 text-[13px] font-semibold text-soft lg:text-sm">
            <i aria-hidden="true" className="h-1 w-7 rounded-[2px] bg-cost lg:w-8" />
            {match.outcome === 'between-members' ? 'Équipe 2' : 'Adversaires'}
          </span>
        </div>
        {match.left && (
          <span className="text-[13px] text-muted-foreground lg:hidden">Un joueur est parti avant la fin</span>
        )}
        <p className="mt-1.5 text-center text-[15px] text-balance text-soft lg:mt-0">{verdict(match, total)}</p>
      </section>
      <Panel aria-label="Tableau des points" className="overflow-hidden lg:rounded-none lg:border-0 lg:bg-transparent">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {[
                ['Joueur', 'Joueur'],
                ['Pts', 'Points'],
                ['Buts', 'Buts'],
                ['Pompes', 'Pompes'],
              ].map(([short, long], index) => (
                <TableHead
                  key={long}
                  scope="col"
                  className={cn('px-3.5 pt-2.5 pb-2 lg:px-5 lg:py-3', index > 0 && 'text-right')}
                >
                  <span className="lg:hidden">{short}</span>
                  <span className="hidden lg:inline">{long}</span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map(({ row, member, label }) => {
              const player = owed.get(row.player_id);
              return (
                <TableRow key={row.player_id} className={cn(!member && 'text-muted-foreground')}>
                  <TableCell className="px-3.5 py-[11px] whitespace-normal lg:px-5 lg:py-3">
                    {member ? <b className="font-semibold">{label}</b> : label}
                    {player?.lastPlace && (
                      <>
                        <small className="block text-xs text-muted-foreground lg:hidden">
                          Moins de points de l’équipe
                        </small>
                        <small className="hidden text-xs text-muted-foreground lg:inline">
                          {' '}
                          · moins de points de l’équipe
                        </small>
                      </>
                    )}
                  </TableCell>
                  <TableCell className={cell}>{formatNumber(row.score)}</TableCell>
                  <TableCell className={cell}>{row.goals ?? '—'}</TableCell>
                  <TableCell className={cell}>
                    {player ? <Pushups value={player.pushups} className="font-sans font-bold" /> : '—'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>
      {total > 0 && (
        <Panel aria-label="Calcul des pompes" className="gap-2.5 p-4 lg:hidden">
          <h2 className="font-display text-lg">Pourquoi ces pompes</h2>
          <div className="flex justify-between text-sm text-soft">
            <span>Défaite · chaque joueur du club</span>
            <b>5</b>
          </div>
          {lowest.map(({ row, pushups }) => (
            <div key={row.player_id} className="flex justify-between text-sm text-soft">
              <span>Moins de points de l’équipe · {row.name}</span>
              <b>+{pushups - 5}</b>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-2.5 text-sm">
            <span>Total pour le club</span>
            <b className="font-numeral text-xl text-cost">{total}</b>
          </div>
        </Panel>
      )}
      {first && (
        <p className="mx-1 flex items-start gap-2 text-xs leading-[1.45] text-muted-foreground lg:hidden">
          <CheckMark
            className={cn('mt-px size-4 stroke-[2.4]', confirmed ? 'text-settled' : 'text-muted-foreground')}
          />
          <span>
            {[match.received ? `Reçu le ${receivedAt.format(new Date(match.received))}` : '', source]
              .filter(Boolean)
              .join(' · ')}
            .
          </span>
        </p>
      )}
      <div className="hidden flex-wrap justify-between gap-3 border-t border-border px-5 py-4 text-[13px] text-muted-foreground lg:flex">
        <span>{ruleOf(match, bonus)}</span>
        {first && (
          <span className="flex items-center gap-1.5">
            <CheckMark className={cn('size-3.5 stroke-[2.6]', confirmed ? 'text-settled' : 'text-muted-foreground')} />
            {source}
          </span>
        )}
      </div>
    </>
  );
}

/** A match arrived less than a quarter of an hour ago: the Direct PC is running, and the dot pulses. */
const recent = (data: BoardState) => {
  const seen = data.collectors[0]?.last_seen;
  return !!seen && Date.now() - Date.parse(seen) < 15 * 60_000;
};

function lastReception(data: BoardState, wide: boolean): string {
  const seen = data.collectors[0]?.last_seen;
  if (!seen) return 'En attente de la première collecte';
  const at = new Date(seen);
  const when = Date.now() - at.getTime() < 86_400_000 ? `à ${clock.format(at)}` : `le ${receivedAt.format(at)}`;
  if (recent(data)) return `Direct PC actif · ${wide ? 'dernier match reçu' : 'reçu'} ${when}`;
  return `Dernier match reçu ${when}`;
}

function Status({ data, wide = false, className }: { data: BoardState; wide?: boolean; className?: string }) {
  return (
    <span className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <i
        aria-hidden="true"
        className={cn(
          'size-[7px] shrink-0 rounded-full',
          data.collectors[0] ? 'bg-settled text-settled' : 'bg-faint',
          recent(data) && 'motion-safe:animate-live',
        )}
      />
      {lastReception(data, wide)}
    </span>
  );
}

/** The design's native check box, drawn with the shadcn one: a white square, blue once ticked. */
const testsBox =
  'rounded-[2px] border-[#767676] bg-white after:hidden data-checked:border-primary data-checked:bg-primary dark:bg-white dark:data-checked:bg-primary';

export function MatchesPage({ guid }: { guid?: string }) {
  const { roster } = useClub();
  const { data } = useBoardState();
  const search = useSearch({ strict: false }) as MatchesSearch;
  const navigate = useNavigate();
  const today = parisDay();
  const yesterday = shiftDay(today, -1);
  const day = search.jour === 'tout' ? '' : validDay(search.jour) && search.jour <= today ? search.jour : today;
  const tests = search.tests === true;
  const period: Period = day === '' ? 'all' : day === today ? 'today' : day === yesterday ? 'yesterday' : 'pick';
  const setSearch = (next: MatchesSearch) =>
    navigate({
      to: guid ? '/matchs/$guid' : '/matchs',
      params: guid ? { guid } : {},
      search: next,
      replace: true,
    } as never);
  const choose = (next: Period) => {
    if (next === 'today') setSearch({ ...(tests && { tests }) });
    if (next === 'yesterday') setSearch({ jour: yesterday, ...(tests && { tests }) });
    if (next === 'all') setSearch({ jour: 'tout', ...(tests && { tests }) });
  };
  const setTests = (checked: boolean) =>
    setSearch({ ...(search.jour && { jour: search.jour }), ...(checked && { tests: true }) });

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
  const dayKind = (d: string) => (d === today ? 'today' : d === yesterday ? 'yesterday' : 'other');
  const groupLabel = (d: string) =>
    d === today ? 'Aujourd’hui' : d === yesterday ? 'Hier' : dayLabel.format(new Date(`${d}T12:00:00Z`));
  // One day: its matches by moment ("Ce soir", "Après-midi"), on a phone only. Every day: by day, everywhere.
  const groups: { key: string; label: string; items: Match[] }[] = [];
  for (const match of matches) {
    const label = day === '' ? groupLabel(match.day) : momentOf(match, dayKind(match.day));
    const group = groups.at(-1);
    if (group && group.label === label) group.items.push(match);
    else groups.push({ key: `${match.day}-${label}`, label, items: [match] });
  }
  const meta = detail
    ? `${detail.kind === 'test' ? 'Test bots' : 'Match'} · ${
        detail.received
          ? shortWhen.format(new Date(detail.received))
          : dayLabel.format(new Date(`${detail.day}T12:00:00Z`))
      }`
    : '';

  return (
    <>
      {guid && detail?.outcome === 'defeat' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-[-16px] top-[calc(-14px-env(safe-area-inset-top))] h-[380px] bg-[radial-gradient(120%_70%_at_50%_-10%,rgb(255_159_69/0.16),rgb(6_6_7/0)_70%)] lg:hidden"
        />
      )}
      <PageStack className="relative">
        <PageHeader
          kicker="Le VAR du club"
          title="Matchs"
          className={cn('max-lg:[&_.kicker]:hidden', guid && 'max-lg:hidden')}
          actions={
            <>
              {data && <Status data={data} className="lg:hidden" />}
              <div className="hidden flex-wrap items-center gap-3.5 lg:flex">
                <label
                  htmlFor="tests-wide"
                  className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px] text-soft"
                >
                  <Checkbox
                    id="tests-wide"
                    checked={tests}
                    onCheckedChange={setTests}
                    className={cn(testsBox, 'my-[3px] mr-[3px] ml-1 size-[18px]')}
                  />
                  Inclure les tests bots
                </label>
                <Segmented label="Période" items={periodItems} value={period} onChange={choose} layout="header" />
              </div>
            </>
          }
        />
        {!data ? (
          <Skeleton className="h-[400px] rounded-card" />
        ) : (
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-start lg:gap-5">
            <PageStack className={cn('lg:min-w-0 lg:flex-[1_1_340px]', guid && 'max-lg:hidden')}>
              <Segmented label="Période" items={periodItems} value={period} onChange={choose} className="lg:hidden" />
              <section
                aria-label="Liste des matchs"
                className="flex flex-col gap-3 lg:gap-0 lg:overflow-hidden lg:rounded-card lg:border lg:border-border lg:bg-card"
              >
                <p className="mx-1 text-sm text-soft lg:mx-0 lg:px-4 lg:py-3.5 lg:text-[13px] lg:text-muted-foreground">
                  {matchesSummary(matches, when, day === today)}
                </p>
                {groups.map((group) => (
                  <section
                    key={group.key}
                    aria-label={group.label || undefined}
                    className="flex flex-col gap-3 lg:gap-0"
                  >
                    {group.label && (
                      <h2
                        className={cn(
                          'px-1 pt-2 text-[13px] font-bold text-foreground first-letter:uppercase',
                          day === '' ? 'lg:border-t lg:border-border lg:px-4 lg:pb-1' : 'lg:hidden',
                        )}
                      >
                        {group.label}
                      </h2>
                    )}
                    {group.items.map((match) => (
                      <MatchItem key={match.guid} match={match} selected={match.guid === detail?.guid} />
                    ))}
                  </section>
                ))}
                <Status data={data} wide className="hidden border-t border-border px-4 py-3 lg:flex" />
              </section>
              <div className="flex flex-col">
                <label
                  htmlFor="tests-phone"
                  className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-1 py-3 text-sm text-soft lg:hidden"
                >
                  Inclure les tests bots
                  <Checkbox
                    id="tests-phone"
                    checked={tests}
                    onCheckedChange={setTests}
                    className={cn(testsBox, 'my-[3px] mr-3 ml-[13px] size-[26px]')}
                  />
                </label>
                <label
                  htmlFor="matches-day"
                  className="flex min-h-11 items-center justify-between gap-3 px-1 text-sm text-soft"
                >
                  Un autre jour
                  <Input
                    id="matches-day"
                    type="date"
                    value={period === 'pick' ? day : ''}
                    max={today}
                    onChange={(event) =>
                      event.target.value && setSearch({ jour: event.target.value, ...(tests && { tests }) })
                    }
                    className={cn(fieldVariants({ size: 'xs' }), 'w-auto')}
                  />
                </label>
              </div>
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
            </PageStack>
            <section
              aria-label={
                detail ? `Détail du match de ${matchTime(detail) || groupLabel(detail.day)}` : 'Détail du match'
              }
              className={cn(
                'relative flex min-w-0 flex-col gap-3.5 lg:flex-[1.7_1_480px] lg:gap-0 lg:overflow-hidden lg:rounded-card lg:border lg:border-border lg:bg-card',
                !guid && 'max-lg:hidden',
              )}
            >
              {guid && (
                <header className="flex h-11 items-center justify-between gap-2 lg:hidden">
                  <BackLink to="/matchs" label="Retour aux matchs" />
                  <span className="kicker truncate">{meta}</span>
                  <span className="w-11 shrink-0" />
                </header>
              )}
              {detail ? (
                <MatchDetail match={detail} data={data} meta={meta} />
              ) : (
                <p className="p-6 text-sm text-muted-foreground">
                  {guid
                    ? 'Ce match n’existe pas ou plus dans l’historique du club.'
                    : 'Choisis un match pour voir son détail.'}
                </p>
              )}
            </section>
          </div>
        )}
      </PageStack>
    </>
  );
}
