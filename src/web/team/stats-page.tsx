import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { cn } from 'cn';
import {
  ArrowDown,
  ArrowUp,
  Bomb,
  Crosshair,
  DoorOpen,
  Dumbbell,
  Eye,
  Flag,
  Ghost,
  Goal,
  type LucideIcon,
  Moon,
  Rocket,
  ShieldCheck,
  Target,
  Timer,
  TrendingDown,
  Trophy,
  Zap,
} from 'lucide-react';
import { type CSSProperties, type ReactNode, useState } from 'react';
import { formatNumber } from '../../lib/format';
import { seasonAt } from '../../lib/season';
import { useBoardState } from '../board';
import { useClub } from '../club';
import { BackLink } from '../components/back-link';
import { BoardPending } from '../components/board-pending';
import { FilterSelect } from '../components/filter-select';
import { SegmentedControl } from '../components/segmented-control';
import { SheetLink } from '../components/sheet-link';
import { TabPage } from '../components/tab-page';
import { Badge } from '../components/ui/badge';
import { buttonVariants } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Skeleton } from '../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { seasonMmrQuery } from '../queries';
import { LadderIcon } from '../shell/icons';
import { type CareerAccount, modesPlayed, type StatsMode, soloAccountOf } from './career';
import {
  bestOf,
  type ComparedPlayer,
  comparedPlayers,
  keyStats,
  type PeakAccount,
  type PeakGap,
  prizes,
  type RankedLine,
  ranked,
  type Stat,
  type StatFormat,
  type StyleAxis,
  type StyleLine,
  seasonsPlayed,
  styleAxes,
  styleOf,
  type TableStat,
  tableSections,
  tableStats,
} from './comparison';
import { tilt, untilt } from './player-card';
import { rankLightRgb, rankRgb } from './stats';

/** The modes the page compares, and how the address names them. */
const modeOptions: readonly { value: StatsMode; label: string; slug: string }[] = [
  { value: 'duel', label: '1v1', slug: '1v1' },
  { value: 'doubles', label: '2v2', slug: '2v2' },
  { value: 'standard', label: '3v3', slug: '3v3' },
  { value: 'tournament-duel', label: 'Tournoi 1v1', slug: 'tournoi-1v1' },
  { value: 'tournament-doubles', label: 'Tournoi 2v2', slug: 'tournoi-2v2' },
  { value: 'tournament-standard', label: 'Tournoi 3v3', slug: 'tournoi-3v3' },
];

const accountOptions = [
  { value: 'solo', label: 'Compte solo', slug: 'solo' },
  { value: 'duo', label: 'Compte duo', slug: 'duo' },
] as const;
type Account = (typeof accountOptions)[number]['value'];

/** How the empty page names the matches of a lone mode. */
const modeWords: Record<StatsMode, string> = {
  duel: 'Pas un 1v1 ranked',
  doubles: 'Pas un 2v2 ranked',
  standard: 'Pas un 3v3 ranked',
  'tournament-duel': 'Pas un tournoi 1v1',
  'tournament-doubles': 'Pas un tournoi 2v2',
  'tournament-standard': 'Pas un tournoi 3v3',
};

/** A filter's choices as the address reads them: `tout`, `aucun`, or their names apart from commas. */
function chosen<Value extends string>(
  /** A lone season reads as a number. */
  written: string | number | undefined,
  options: readonly { value: Value; slug: string }[],
  fallback: readonly Value[],
): Value[] {
  if (written === undefined) return options.filter((option) => fallback.includes(option.value)).map((o) => o.value);
  if (written === 'tout') return options.map((option) => option.value);
  const slugs = String(written).split(',');
  return options.filter((option) => slugs.includes(option.slug)).map((option) => option.value);
}

/** A filter's choices as the address writes them. */
function written<Value extends string>(
  values: readonly Value[],
  options: readonly { value: Value; slug: string }[],
): string {
  if (values.length === options.length) return 'tout';
  if (values.length === 0) return 'aucun';
  return options
    .filter((option) => values.includes(option.value))
    .map((option) => option.slug)
    .join(',');
}

function formatted(value: number | null, format: StatFormat): string {
  if (value === null) return '–';
  if (format === 'percent') return `${formatNumber(Math.round(value))} %`;
  // Two decimals: averages of a few matches are close, and one decimal would show a tie the bars deny.
  if (format === 'perMatch') return formatNumber(Math.round(value * 100) / 100);
  if (format === 'mmr') return value > 0 ? `+${formatNumber(value)}` : value < 0 ? `−${formatNumber(-value)}` : '0';
  // The game sends ball speeds in km/h, and distances in Unreal units: centimetres.
  if (format === 'speed') return `${formatNumber(Math.round(value))}\u00a0km/h`;
  if (format === 'distance') return `${formatNumber(Math.round(value / 10) / 10)}\u00a0m`;
  if (format === 'seconds') return `${formatNumber(Math.round(value * 10) / 10)}\u00a0s`;
  return formatNumber(Math.round(value));
}

/**
 * The Stats page, opened from L'équipe: every player side by side over one season, or every season. The 2v2 peak
 * leads, as it tells a level; then the figures that say the most, the prizes, and every stat in a table.
 */
export function StatsPage() {
  const club = useClub();
  const { board, error } = useBoardState();
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const current = seasonAt(new Date().toISOString());
  // The ratings come apart from the board: until they arrive, the peaks wait and the rest shows.
  const stats = useQuery(seasonMmrQuery).data;
  const seasonMmr = stats?.seasons ?? [];
  const played = board ? seasonsPlayed(board, seasonMmr, club.roster) : [];
  const seasonOptions = [...new Set([...(current === null ? [] : [current]), ...played])]
    .sort((a, b) => b - a)
    .map((number) => ({
      value: String(number),
      label: `Saison ${number}${number === current ? ' (en cours)' : ''}`,
      slug: String(number),
    }));
  // A tournament in 1v1 is rare: the choice shows once the club played one.
  const tournamentDuels = board ? modesPlayed(board).has('tournament-duel') : false;
  const modes = modeOptions.filter((option) => option.value !== 'tournament-duel' || tournamentDuels);
  const hasSolo = board ? club.roster.some((name) => soloAccountOf(board, name) !== null) : false;
  // The current season, in 2v2, on both accounts, until the member picks otherwise: the club plays 2v2 first.
  const seasons = chosen(search.saison, seasonOptions, current === null ? [] : [String(current)]);
  const chosenModes = chosen<StatsMode>(search.mode, modes, ['doubles']);
  // Without a solo account found, every match is on the duo one: no choice to make.
  const chosenAccounts: Account[] = hasSolo
    ? chosen<Account>(search.compte, accountOptions, ['solo', 'duo'])
    : ['solo', 'duo'];
  // Every season counts every match, those before the seasons the app knows included.
  const seasonFilter =
    seasons.length > 1 && seasons.length === seasonOptions.length
      ? null
      : new Set(seasons.map((season) => Number(season)));
  const account: CareerAccount = chosenAccounts.length === 2 ? 'all' : (chosenAccounts[0] ?? 'all');
  const lone = seasonFilter?.size === 1 ? [...seasonFilter][0] : undefined;
  const players = board
    ? comparedPlayers(board, seasonMmr, club.roster, club.me.duoPseudo, new Set(chosenModes), account, seasonFilter)
    : [];
  const missing =
    seasons.length === 0
      ? 'une saison'
      : chosenModes.length === 0
        ? 'un mode'
        : chosenAccounts.length === 0
          ? 'un compte'
          : null;
  const anyMatch = missing === null && players.some((player) => player.career.matches > 0);
  // A lone season stays a number in the address, as before: `?saison=23`, not `?saison="23"`.
  const filter = (key: 'saison' | 'mode' | 'compte', value: string) =>
    void navigate({
      to: '.',
      search: (previous) => ({ ...previous, [key]: /^\d+$/.test(value) ? Number(value) : value }),
      resetScroll: false,
    });
  const nothing = `${chosenModes.length === 1 ? modeWords[chosenModes[0] ?? 'doubles'] : 'Pas un match dans ces modes'} ${
    seasonFilter === null ? 'au compteur' : lone !== undefined ? `en saison ${lone}` : 'sur ces saisons'
  }. Le kickoff attend.`;

  return (
    <TabPage
      back={<BackLink to="/">L’équipe</BackLink>}
      kicker="La team en chiffres"
      title="Stats"
      aside={
        <SheetLink sheet="ranks" className={buttonVariants({ variant: 'bubble', size: 'hint' })}>
          <LadderIcon />
          Les ranks
        </SheetLink>
      }
    >
      <div className="flex animate-rise flex-col gap-10 px-5 pt-6 [animation-delay:.06s] lg:gap-14 lg:px-0 lg:pt-0">
        {/* On a phone, the filters stay on one line and scroll sideways, to the screen's edges, as iOS chips do. */}
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0 [&>*]:shrink-0">
          <FilterSelect
            label="Saison"
            allLabel="Toutes les saisons"
            noneLabel="Aucune saison"
            several={(count) => `${count} saisons`}
            options={seasonOptions}
            value={seasons}
            onChange={(next) => filter('saison', written(next, seasonOptions))}
          />
          <FilterSelect
            label="Mode"
            allLabel="Tous les modes"
            noneLabel="Aucun mode"
            several={(count) => `${count} modes`}
            options={modes}
            value={chosenModes}
            onChange={(next) => filter('mode', written(next, modes))}
          />
          {hasSolo && (
            <FilterSelect
              label="Compte"
              allLabel="Tous les comptes"
              noneLabel="Aucun compte"
              several={(count) => `${count} comptes`}
              options={accountOptions}
              value={chosenAccounts}
              onChange={(next) => filter('compte', written(next, accountOptions))}
            />
          )}
        </div>
        {!board && (
          <BoardPending error={error} className="flex flex-col gap-3">
            <Skeleton className="h-[220px] rounded-[22px]" />
            <Skeleton className="h-[300px] rounded-[22px]" />
          </BoardPending>
        )}
        {board && lone !== undefined && <SeasonPeaks players={players} season={lone} />}
        {board && !anyMatch && (
          <p className="m-0 -mt-4 text-[15px] text-t2">
            {missing === null ? nothing : `Coche au moins ${missing} pour voir les stats.`}
          </p>
        )}
        {board && anyMatch && (
          <>
            <Section kicker="L’essentiel" title="Les chiffres clés">
              {/* The matches first, the width of the row on a tablet: the time each one spent on the game. */}
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5 md:[&>:first-child]:col-span-2 lg:[&>:first-child]:col-span-1">
                {keyStats.map((stat) => (
                  <StatCard key={stat.label} stat={stat} players={players} />
                ))}
              </div>
            </Section>
            <Section kicker="Le style de jeu" title="Quel joueur es-tu ?">
              <p className="m-0 -mt-2 text-[15px] text-t2">Pas de gagnant ici : chacun face au reste du club.</p>
              <div className="grid gap-3 md:grid-cols-2">
                {styleAxes.map((axis) => (
                  <StyleCard key={axis.label} axis={axis} players={players} />
                ))}
              </div>
            </Section>
            <Section kicker="Les prix" title="Et le trophée revient à…">
              <PrizeShelf players={players} />
            </Section>
            <Section kicker="Tout le détail" title="Le tableau">
              <StatsTable stats={tableStats(new Set(chosenModes), players, stats?.statfeedLabels)} players={players} />
            </Section>
          </>
        )}
      </div>
    </TabPage>
  );
}

/** A block of the page, after the tabs' model: small capitals, then a title. */
function Section({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <section aria-label={kicker} className="flex flex-col gap-[18px]">
      <span className="flex flex-col gap-1.5">
        <span className="label-caps">{kicker}</span>
        <h2 className="title-display text-[24px] [line-height:normal]">{title}</h2>
      </span>
      {children}
    </section>
  );
}

/**
 * A player's pseudo, and TOI for the member. Their rank shows in the peaks, not again by every name. In a narrow
 * column, the pseudo wraps rather than losing its end.
 */
function PlayerName({ player, wrap, className }: { player: ComparedPlayer; wrap?: boolean; className?: string }) {
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5', wrap && 'flex-wrap gap-y-1', className)}>
      <span className={wrap ? '[overflow-wrap:anywhere]' : 'truncate'}>{player.shown}</span>
      {player.me && <Badge variant="me">TOI</Badge>}
    </span>
  );
}

/** The accounts a podium of peaks can compare: the solo one, each player's own level, first. */
const peakAccounts = [
  { value: 'solo', label: 'Solo' },
  { value: 'duo', label: 'Duo' },
] as const satisfies readonly { value: PeakAccount; label: string }[];

/** The gap between the season's peak and the peak all time before it, on an account: what ranks the players. */
const gapStatOf = (kind: PeakAccount): Stat => ({
  label: 'Écart au peak all time',
  format: 'mmr',
  value: (player) => player.peakGaps[kind]?.gap ?? null,
});

/** The podium's steps: the first in the middle and highest, the second on the left, the third on the right. */
const podiumSteps = {
  1: { column: 'col-start-2', pedestal: 'h-14 lg:h-16' },
  2: { column: 'col-start-1', pedestal: 'h-9 lg:h-10' },
  3: { column: 'col-start-3', pedestal: 'h-5 lg:h-6' },
} as const;

/**
 * « Au plus près de son peak all time »: the podium of the accounts whose peak of the season came closest to their
 * peak all time before it, or beat it by the most; the solo accounts first, each player's own level, the duo ones a
 * tap away. Each step is a player card: the gap reads first, then the player under their rank, then the season's peak
 * over the peak all time it is measured against. Levels differ: the club compares the gaps, not the peaks.
 */
function SeasonPeaks({ players, season }: { players: ComparedPlayer[]; season: number }) {
  const [kind, setKind] = useState<PeakAccount>('solo');
  const { lines } = ranked(gapStatOf(kind), players);
  const climbers = lines.filter((line) => line.player.peakGaps[kind]?.gap != null);
  const nameOf = (player: ComparedPlayer) => (kind === 'solo' ? player.soloShown : player.name);
  const unknown = lines.filter((line) => line.player.peakGaps[kind]?.gap == null).map((line) => nameOf(line.player));
  return (
    <section aria-label="Au plus près de son peak all time" className="flex flex-col gap-4">
      <span className="flex flex-wrap items-end justify-between gap-3">
        <span className="flex flex-col gap-1.5">
          <span className="label-caps">
            Saison {season} · peak {kind}
          </span>
          <h2 className="title-display text-[24px] [line-height:normal]">Au plus près de son peak all time</h2>
        </span>
        <span className="w-[160px]">
          <SegmentedControl label="Compte du podium" options={peakAccounts} value={kind} onChange={setKind} />
        </span>
      </span>
      <ol className="m-0 grid list-none grid-cols-3 items-end gap-2 p-0 lg:mx-auto lg:w-full lg:max-w-[760px] lg:gap-5">
        {climbers.slice(0, 3).map((line, index) => (
          <PodiumCard
            key={line.player.name}
            line={line}
            gap={line.player.peakGaps[kind] as PeakGap}
            name={nameOf(line.player)}
            step={(index + 1) as 1 | 2 | 3}
          />
        ))}
      </ol>
      {climbers.length > 3 && (
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {climbers.slice(3).map(({ player, place }) => (
            <li
              key={player.name}
              className={cn('flex items-center gap-3 py-1.5 text-[14px] text-t2', player.me && mineClass)}
            >
              <Place place={place} mine={player.me} />
              <PlayerName player={{ ...player, shown: nameOf(player) }} className="flex-1" />
              <b className="num text-[17px] text-t1">{formatted(player.peakGaps[kind]?.gap ?? null, 'mmr')}</b>
            </li>
          ))}
        </ol>
      )}
      {unknown.length > 0 && (
        <p className="m-0 text-[12px] text-t3 [line-height:1.45]">
          Pas de peak {kind} relevé cette saison, ou pas de peak all time d’avant connu :{' '}
          {new Intl.ListFormat('fr').format(unknown)}.
        </p>
      )}
    </section>
  );
}

/**
 * A peak in small: its capitals, then the figure in the colour of its rank. The season's peak carries an arrow, up
 * when it went past the peak all time, down when it stayed under: the gap above says by how much.
 */
function PeakFigure({
  label,
  value,
  tier,
  rise,
}: {
  label: string;
  value: number;
  tier: number | null;
  rise?: number | null;
}) {
  const Arrow = rise ? (rise > 0 ? ArrowUp : ArrowDown) : null;
  return (
    <span className="flex items-baseline justify-between gap-2">
      <span className="text-t3">{label}</span>
      <span className="flex items-center gap-0.5">
        {Arrow && (
          <Arrow
            aria-hidden="true"
            strokeWidth={3}
            className={cn('size-3', rise && rise > 0 ? 'text-win' : 'text-t3')}
          />
        )}
        <span className="num text-[14px] lg:text-[15px]" style={{ color: `rgb(${rankLightRgb(tier)})` }}>
          {formatNumber(value)}
        </span>
      </span>
    </span>
  );
}

/** One step of the podium: a player card in their rank's colour, standing on its pedestal. */
function PodiumCard({ line, gap, name, step }: { line: RankedLine; gap: PeakGap; name: string; step: 1 | 2 | 3 }) {
  const { player, place } = line;
  const rgb = rankRgb(gap.tier);
  const first = step === 1;
  const atLeast = (gap.gap ?? -1) >= 0;
  return (
    <li className={cn('row-start-1 flex min-w-0 animate-rise flex-col gap-2', podiumSteps[step].column)}>
      <div
        onPointerMove={tilt}
        onPointerLeave={untilt}
        style={{ '--rank': rgb, '--rank-light': rankLightRgb(gap.tier) } as CSSProperties}
        className={cn(
          'player-card flex flex-col items-center gap-3 px-2.5 pt-4 pb-3.5 text-center lg:gap-4 lg:px-4 lg:pt-6 lg:pb-5',
          player.me && 'shadow-[inset_0_0_0_1px_rgba(255,255,255,.32)]',
        )}
      >
        <i
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-1"
          style={{ background: `radial-gradient(130% 70% at 50% -10%, rgba(${rgb},.32), rgba(${rgb},0) 65%)` }}
        />
        <i aria-hidden="true" className="player-card-holo pointer-events-none absolute inset-0 z-2" />
        <i aria-hidden="true" className="player-card-glint pointer-events-none absolute inset-0 z-3" />
        <span className="relative z-4 flex flex-col items-center gap-1.5">
          <b
            className={cn(
              'num [line-height:.85]',
              first ? 'text-[38px] lg:text-[52px]' : 'text-[30px] lg:text-[42px]',
              atLeast ? 'text-win' : 'text-t1',
            )}
          >
            {formatted(gap.gap, 'mmr')}
          </b>
          <span className="label-caps text-[10px]">écart</span>
        </span>
        <img
          src={`/rocket-league/ranks/${gap.tier ?? 0}.png`}
          alt=""
          className={cn(
            'relative z-4 object-contain [filter:drop-shadow(0_6px_16px_rgba(var(--rank),.55))]',
            first ? 'size-14 lg:size-20' : 'size-11 lg:size-16',
          )}
        />
        <span className="relative z-4 flex w-full min-w-0 flex-col items-center gap-2">
          <span className="flex min-w-0 max-w-full flex-col items-center gap-1 lg:flex-row">
            <b className="line-clamp-2 break-all font-semibold text-[13px] [line-height:1.2] lg:text-[15px]">{name}</b>
            {player.me && <Badge variant="tag">TOI</Badge>}
          </span>
          {/* The season's peak over the peak all time before it: the gap reads from one to the other. */}
          <span className="flex w-full max-w-[150px] flex-col gap-1 text-[11px] lg:text-[12px]">
            <PeakFigure label="Saison" value={gap.peak} tier={gap.tier} rise={gap.gap} />
            {gap.allTime !== null && <PeakFigure label="All time" value={gap.allTime} tier={gap.allTimeTier} />}
          </span>
        </span>
      </div>
      <div
        aria-hidden="true"
        className={cn(
          'flex origin-bottom animate-pedestal items-start justify-center rounded-[12px_12px_4px_4px] pt-1.5',
          podiumSteps[step].pedestal,
          first
            ? 'bg-linear-to-b from-white/18 to-white/4 shadow-[inset_0_1px_0_rgba(255,255,255,.35)]'
            : 'bg-linear-to-b from-white/8 to-white/2 shadow-[inset_0_1px_0_rgba(255,255,255,.14)]',
        )}
      >
        <span className={cn('num text-[15px] lg:text-[17px]', player.me ? medals[place ?? 0] : 'text-t3')}>
          {place}
        </span>
      </div>
      <span className="sr-only">Place {place}</span>
    </li>
  );
}

/**
 * One of the figures that say the most: the member's own in big, then every player's bar, the best first. A member
 * without a line of their own sees the leader's figure.
 */
function StatCard({ stat, players }: { stat: Stat; players: ComparedPlayer[] }) {
  const { lines, leaders } = ranked(stat, players);
  const value = (lines.find((line) => line.player.me) ?? leaders[0])?.value ?? null;
  return (
    <Card variant="glass" role="region" aria-label={stat.label} className="gap-4 p-5">
      <span className="label-caps">{stat.label}</span>
      <b className={cn('num text-[40px] [line-height:.85]', value === null && 'text-t3')}>
        {formatted(value, stat.format)}
      </b>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
        {lines.map((line) => (
          <Bar key={line.player.name} line={line} format={stat.format} />
        ))}
      </ol>
    </Card>
  );
}

/**
 * An axis of play style: each player a dot in their colour on a line, the club's own ratio in the middle, then each
 * player's ratio below. No green, no medal: a style is no ranking.
 */
function StyleCard({ axis, players }: { axis: StyleAxis; players: ComparedPlayer[] }) {
  const { lines } = styleOf(axis, players);
  const dots = laned(lines);
  return (
    <Card variant="glass" role="region" aria-label={axis.label} className="gap-5 p-5">
      <span className="label-caps">{axis.label}</span>
      <div className="flex flex-col gap-2.5">
        <div className="relative h-10">
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-linear-to-r from-white/5 via-white/12 to-white/5"
          />
          <span
            aria-hidden="true"
            className="absolute top-1/2 left-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30"
          />
          {dots.map(
            ({ player, position, lane, ratio }) =>
              position !== null && (
                // Its target is the dot itself: two close dots, one above the other, must each answer to their own.
                <FigureBubble
                  key={player.name}
                  label={`${player.shown}, ${formatted(ratio, 'perMatch')}`}
                  className={cn(
                    'group absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-[left] duration-700 ease-(--ease)',
                    player.me ? 'size-5' : 'size-[18px]',
                  )}
                  style={
                    {
                      left: `${position * 100}%`,
                      top: `calc(50% + ${lane * 12}px)`,
                      '--dot': rankRgb(player.tier),
                    } as CSSProperties
                  }
                  figure={
                    <i
                      className={cn(
                        'block rounded-full bg-[rgb(var(--dot))] transition-transform group-hover:scale-125 group-data-[popup-open]:scale-125',
                        player.me
                          ? 'size-5 shadow-[0_0_0_2.5px_var(--color-t1),0_0_16px_rgba(var(--dot),.8)]'
                          : 'size-3.5 shadow-[0_0_0_2px_rgba(0,0,0,.55)]',
                      )}
                    />
                  }
                >
                  <span className="font-semibold text-[12px] text-t2">{player.shown}</span>
                  <b className="num text-[17px] [line-height:1]">{formatted(ratio, 'perMatch')}</b>
                </FigureBubble>
              ),
          )}
        </div>
        <span className="grid grid-cols-3 text-[12px] text-t3">
          <span>{axis.low}</span>
          <span className="text-center">Le club</span>
          <span className="text-right">{axis.high}</span>
        </span>
      </div>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {lines.map(({ player, ratio }) => (
          <li
            key={player.name}
            className={cn('flex items-center gap-2.5', player.me ? 'text-[15px] text-t1' : 'text-[13px] text-t2')}
          >
            <i
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ background: `rgb(${rankRgb(player.tier)})` }}
            />
            <PlayerName player={player} className={cn('flex-1', player.me && 'font-semibold')} />
            <span className={cn('num', player.me ? 'text-[17px]' : 'text-[15px]', ratio === null && 'text-t3')}>
              {formatted(ratio, 'perMatch')}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/**
 * The dots of an axis, each in a lane so that two close ones both show: on the line, then just above, then just
 * below. The member's comes last, above the others.
 */
function laned(lines: StyleLine[]): (StyleLine & { lane: number })[] {
  const placed: (StyleLine & { lane: number })[] = [];
  for (const line of [...lines].sort((a, b) => Number(a.player.me) - Number(b.player.me))) {
    const near = placed.filter(
      (other) => line.position !== null && other.position !== null && Math.abs(other.position - line.position) < 0.05,
    );
    const lane = [0, -1, 1].find((candidate) => !near.some((other) => other.lane === candidate)) ?? 0;
    placed.push({ ...line, lane });
  }
  return placed;
}

/** The member's place wears a medal's colour on the podium. */
const medals: Record<number, string> = { 1: 'text-medal-1', 2: 'text-medal-2', 3: 'text-medal-3' };

/**
 * A player's place in a ranking. The member's in big, in its medal's colour on the podium: what the eye finds first;
 * the others' small and quiet.
 */
function Place({ place, mine }: { place: number | null; mine: boolean }) {
  return (
    <span
      className={cn(
        'num w-5 text-center [line-height:1]',
        mine ? ['text-[22px]', (place && medals[place]) ?? 'text-t1'] : 'text-[13px] text-t3',
      )}
    >
      {place ?? '–'}
    </span>
  );
}

/** The member's own line, set apart in a soft capsule, as a selected row would be. */
const mineClass = '-mx-3 rounded-[14px] bg-white/7 px-3 shadow-[inset_0_0_0_.5px_rgba(255,255,255,.1)]';

/**
 * A player's line in a stat: their place, pseudo and figure, then their bar. The member's stands out in a capsule,
 * their bar in white; the others' stay grey.
 */
function Bar({ line, format }: { line: RankedLine; format: StatFormat }) {
  const mine = line.player.me;
  return (
    <li className={cn('grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 py-1.5', mine && mineClass)}>
      <Place place={line.place} mine={line.player.me} />
      <span className="flex min-w-0 flex-col gap-1.5">
        <span
          className={cn(
            'flex items-baseline justify-between gap-3',
            mine ? 'text-[15px] text-t1' : 'text-[13px] text-t2',
          )}
        >
          <PlayerName player={line.player} className={cn(mine && 'font-semibold')} />
          <span
            className={cn(
              'num',
              mine ? 'text-[17px]' : 'text-[15px]',
              line.value === null ? 'text-t3' : mine ? 'text-t1' : 'text-t2',
            )}
          >
            {formatted(line.value, format)}
          </span>
        </span>
        <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-white/6">
          <i
            className={cn('block h-full origin-left animate-grow rounded-full', mine ? 'bg-t1' : 'bg-white/40')}
            style={{ width: `${line.share * 100}%` }}
          />
        </span>
      </span>
    </li>
  );
}

/** Each prize's picture, drawn from its stat. */
const prizeIcons: Record<string, LucideIcon> = {
  'Le démolisseur': Bomb,
  'L’abonné aux montants': Goal,
  'Le roi des prolongations': Timer,
  'Le mur': ShieldCheck,
  'Le noctambule': Moon,
  'Le fugueur': DoorOpen,
  'Le pompier': Dumbbell,
  'Le parachutiste': TrendingDown,
  'Le canonnier': Zap,
  'Le bolide': Rocket,
  'Le sniper': Crosshair,
  'L’œil de lynx': Eye,
  'Le roi du kickoff': Flag,
  'Le punching-ball': Target,
  'Le traître': Ghost,
};

/** What the member lacks to take a prize from its leader, in the prize's own unit. */
function gapOf(leader: number | null, mine: number, format: StatFormat): string {
  const gap = Math.max(0, (leader ?? 0) - mine);
  if (format === 'percent') return `${formatNumber(Math.round(gap))} point${Math.round(gap) >= 2 ? 's' : ''}`;
  if (format === 'perMatch') return `${formatted(gap, format)} par match`;
  return formatted(gap, format);
}

/**
 * A player's bar in a trophy: their pseudo and figure, then their bar against the leader's; the member's in white. A
 * prize given to a rate ends each bar with how many times it happened, in small: the rate ranks, the count tells. It
 * keeps the same width on every line, so that the bars keep one scale.
 */
function PrizeLine({
  line,
  format,
  count,
}: {
  line: RankedLine;
  format: StatFormat;
  count: number | null | undefined;
}) {
  const mine = line.player.me;
  return (
    <li className="flex flex-col gap-1">
      <span
        className={cn('flex min-w-0 items-baseline justify-between gap-2 text-[12px]', mine ? 'text-t1' : 'text-t2')}
      >
        <span className={cn('min-w-0 truncate', mine && 'font-semibold')}>{line.player.shown}</span>
        <span className={cn('num shrink-0 text-[13px]', line.value === null && 'text-t3')}>
          {formatted(line.value, format)}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className="h-1 flex-1 overflow-hidden rounded-full bg-white/6">
          <i
            className={cn('block h-full origin-left animate-grow rounded-full', mine ? 'bg-t1' : 'bg-white/40')}
            style={{ width: `${line.share * 100}%` }}
          />
        </span>
        {count !== undefined && (
          <span className="w-12 shrink-0 text-right text-[11px] text-t3 [line-height:1]">
            {line.value === null || count === null ? '' : `${formatNumber(count)}\u00a0fois`}
          </span>
        )}
      </span>
    </li>
  );
}

/**
 * The prizes as a trophy shelf: small tiles, the member's own trophies first and in gold, each with every player's
 * bar, the leader first, and what the member lacks to take it. A prize nobody can win yet (a stat no collector sent)
 * waits.
 */
function PrizeShelf({ players }: { players: ComparedPlayer[] }) {
  const shelf = prizes
    .filter((prize) => players.some((player) => prize.value(player) !== null))
    .map((prize) => ({ prize, ...ranked(prize, players) }))
    .map((entry) => ({ ...entry, won: entry.leaders.some((line) => line.player.me) }))
    .sort((a, b) => Number(b.won) - Number(a.won));
  const won = shelf.filter((entry) => entry.won).length;
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 -mt-2 text-[15px] text-t2">
        {won === 0
          ? 'Aucun pour toi cette fois. La revanche est à un match.'
          : `Tu en remportes ${formatNumber(won)} sur ${formatNumber(shelf.length)}.`}
      </p>
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 lg:grid-cols-4">
        {shelf.map(({ prize, lines, leaders, won: mine }) => {
          const Icon = prizeIcons[prize.prize] ?? Trophy;
          const [leader] = leaders;
          const me = lines.find((line) => line.player.me);
          return (
            <li
              key={prize.prize}
              className={cn(
                'relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-[20px] p-4',
                mine
                  ? 'bg-[radial-gradient(120%_90%_at_0%_0%,color-mix(in_oklab,var(--medal-1)_16%,transparent),transparent_65%),rgba(255,255,255,.05)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--medal-1)_45%,transparent)]'
                  : 'bg-white/4 shadow-[inset_0_0_0_.5px_rgba(255,255,255,.08)]',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-10 items-center justify-center rounded-full',
                  mine ? 'bg-medal-1/15 text-medal-1' : 'bg-white/7 text-t2',
                )}
              >
                <Icon size={20} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <h3 className="title-display text-[18px] [line-height:1.1]">{prize.prize}</h3>
                <span className="text-[12px] text-t3 [line-height:1.3]">{prize.label}</span>
              </span>
              <ol aria-label={`Classement : ${prize.prize}`} className="m-0 mt-auto flex list-none flex-col gap-2 p-0">
                {lines.map((line) => (
                  <PrizeLine
                    key={line.player.name}
                    line={line}
                    format={prize.format}
                    count={prize.total ? prize.total(line.player) : undefined}
                  />
                ))}
              </ol>
              <span className={cn('text-[12px] [line-height:1.3]', mine ? 'text-medal-1' : 'text-t2')}>
                {mine
                  ? 'Il est à toi.'
                  : leader && me?.value != null
                    ? `Il te manque ${gapOf(leader.value, me.value, prize.format)}.`
                    : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The stats' column, kept in view as the players' scroll under it. On a phone it takes a set width and its labels
 * wrap, so that the players keep the room; a line marks its edge.
 */
const labelColumn =
  'sticky left-0 z-1 h-auto align-top w-[8.75rem] min-w-[8.75rem] max-w-[8.75rem] whitespace-normal bg-card py-2.5 pl-4 font-normal text-[13px] [line-height:1.25] shadow-[inset_-1px_0_0_var(--line)] lg:w-auto lg:min-w-0 lg:max-w-none lg:whitespace-nowrap lg:pl-5 lg:text-[14px] lg:shadow-none';

/**
 * Every stat, part by part, one column per player, the member's tinted, the best figure of each line lit. Each part
 * says above it whether its figures read per match.
 */
function StatsTable({ stats, players }: { stats: TableStat[]; players: ComparedPlayer[] }) {
  const sections = tableSections
    .map((section) => ({ section, stats: stats.filter((stat) => stat.section === section) }))
    .filter(({ stats: lines }) => lines.length > 0);
  return (
    <>
      <Card variant="glass" className="gap-0 py-1">
        <Table className="text-[14px]">
          <TableHeader>
            <TableRow className="border-line hover:bg-transparent">
              <TableHead className={cn(labelColumn, 'text-t3')}>
                <span className="sr-only">Stat</span>
              </TableHead>
              {players.map((player) => (
                <TableHead
                  key={player.name}
                  className={cn(
                    'h-auto min-w-[4.25rem] whitespace-normal py-3 text-right align-bottom last:pr-4 lg:min-w-24 lg:last:pr-5',
                    player.me && 'bg-white/6',
                  )}
                >
                  <PlayerName
                    player={player}
                    wrap
                    className="justify-end font-semibold text-[13px] text-t1 [line-height:1.2]"
                  />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          {sections.map(({ section, stats: lines }) => (
            <TableBody key={section}>
              <TableRow className="border-0 hover:bg-transparent">
                <TableHead
                  colSpan={players.length + 1}
                  scope="colgroup"
                  className="h-auto px-4 pt-6 pb-2 font-normal lg:px-5"
                >
                  <span className="label-caps">
                    {section}
                    {lines.some((line) => line.perMatch) && <span className="text-t3/70"> · par match</span>}
                  </span>
                </TableHead>
              </TableRow>
              {lines.map((stat) => {
                const best = bestOf(stat, players);
                return (
                  <TableRow key={stat.label} className="border-line hover:bg-white/3">
                    <TableHead scope="row" className={cn(labelColumn, 'text-t2')}>
                      {stat.label}
                      {stat.lowerIsBetter && (
                        <span className="ml-1 text-t3" title="Le plus bas est le meilleur">
                          ↓
                        </span>
                      )}
                    </TableHead>
                    {players.map((player) => {
                      const value = stat.value(player);
                      const count = value === null ? null : (stat.total?.(player) ?? null);
                      const figure = formatted(value, stat.format);
                      const tone = value === null ? 'text-t3' : value === best ? 'text-win' : 'text-t1';
                      return (
                        <TableCell
                          key={player.name}
                          className={cn(
                            'py-2.5 text-right align-top last:pr-4 lg:last:pr-5',
                            player.me && 'bg-white/6',
                          )}
                        >
                          {count === null ? (
                            <b className={cn('num text-[15px] [line-height:1.1]', tone)}>{figure}</b>
                          ) : (
                            <TotalOf
                              figure={figure}
                              tone={tone}
                              count={formatNumber(count)}
                              of={stat.of ? formatNumber(stat.of(player)) : null}
                            />
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          ))}
        </Table>
      </Card>
      <p className="m-0 -mt-2 px-1 text-[12px] text-t3 [line-height:1.45]">
        <span className="text-win">En vert</span>, le meilleur de chaque ligne ; ↓ : le plus bas est le meilleur. Touche
        ou survole un chiffre pour voir son total.
      </p>
    </>
  );
}

/**
 * A rate of the table, and the total it comes from in a small bubble, so that the table keeps one figure per player.
 */
function TotalOf({ figure, tone, count, of }: { figure: string; tone: string; count: string; of: string | null }) {
  return (
    <FigureBubble
      label={`${figure}, ${count}${of ? ` sur ${of}` : ''} au total`}
      className={cn(
        'num -mx-1.5 -my-0.5 rounded-[7px] px-1.5 py-0.5 text-[15px] [line-height:1.1] transition-colors hover:bg-white/8 data-[popup-open]:bg-white/10',
        tone,
      )}
      figure={figure}
    >
      <span className="label-caps text-[10px]">Au total</span>
      <span className="flex items-baseline gap-1 whitespace-nowrap">
        <b className="num text-[17px] [line-height:1]">{count}</b>
        {of && (
          <>
            <span className="text-[12px] text-t3">sur</span>
            <b className="num text-[17px] [line-height:1]">{of}</b>
          </>
        )}
      </span>
    </FigureBubble>
  );
}

/**
 * A figure that says more in a small bubble above it: on hover on a computer, on a tap on a phone. Its label tells a
 * screen reader the same without opening it.
 */
function FigureBubble({
  label,
  className,
  style,
  figure,
  children,
}: {
  label: string;
  className: string;
  style?: CSSProperties;
  figure: ReactNode;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger openOnHover delay={120} aria-label={label} className={className} style={style}>
        {figure}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={6}
        className="w-auto items-center gap-0.5 rounded-[12px] bg-[rgba(28,28,30,.94)] px-3 py-2 text-t1 ring-white/10 backdrop-blur-[30px]"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}
